#!/usr/bin/env bash
# The governed settlement, inside the judge package.
#
#   govern.sh seat      one-time: peer the three approver nodes, create the
#                       decentralised party at threshold 2, give it a member
#                       party on each node, deploy the governance rules, and
#                       admit the paying agent as a proposer
#   govern.sh prepare   set the run's approver and make every allocation ready
#   govern.sh propose   the paying agent files the proposal
#   govern.sh confirm N approver node N confirms
#   govern.sh execute N approver node N executes: refused below threshold
#   govern.sh status    where the vote stands
#
# This is a port of BitSafe's hackathon/seed.sh and our infra/govern.ps1 onto
# the judge stack. Two differences from their sandbox, both because our
# Canton is ours:
#
#   * No DAR distribution step. quickstart/bootstrap.canton already vets all
#     thirteen packages on every participant, so there is nothing to send.
#   * No identity provider. Canton validates an unsafe HS256 token against a
#     public secret, and the DecMan nodes run with DECPM_INSECURE so they
#     mint one that matches. That is the whole of the authentication here.
set -euo pipefail

# This network authenticates with one unsafe, non-expiring demo token (see
# quickstart/canton.conf). Public on purpose: the network is local and holds
# nothing of value. Only Canton wants it - the approver nodes mint their own.
AUTH=(-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwYXJ0aWNpcGFudF9hZG1pbiIsImF1ZCI6Imh0dHBzOi8vY2FudG9uLm5ldHdvcmsuZ2xvYmFsIiwiZXhwIjo0MDcwOTA4ODAwfQ.WOS0ZzNrmPtZZaPJXHF8VpF6HKs2r26F_JTG1CUGg08")

OUT=/demo
STATE=$OUT/govern.json
DAR=/indivisa/indivisa-governance-test-0.1.0.dar
TAG="${INDIVISA_TAG:-demo}"
PARTY_PREFIX="${INDIVISA_PARTY_PREFIX:-indivisa-approvers}"
RUNNER=(java -jar /opt/daml-script.jar)

# Approver node N runs against this participant. alice, bob and charlie also
# host holders; that is fine, a participant can host any number of parties,
# and it keeps the paying agent's node out of the approver set.
node_http()   { case "$1" in 1) echo "decman-1:8081";; 2) echo "decman-2:8082";; 3) echo "decman-3:8083";; esac; }
node_json()   { case "$1" in 1) echo "canton:5033";;   2) echo "canton:5043";;   3) echo "canton:5053";;   esac; }
node_name()   { case "$1" in 1) echo alice;;           2) echo bob;;            3) echo charlie;;         esac; }

say()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

dm_get()  { curl -fsS "http://$(node_http "$1")$2"; }
dm_post() { curl -fsS -X POST -H 'Content-Type: application/json' -d "$3" "http://$(node_http "$1")$2"; }
dm_put()  { curl -fsS -X PUT  -H 'Content-Type: application/json' -d "$3" "http://$(node_http "$1")$2"; }
cn_post() { curl -fsS "${AUTH[@]}" -X POST -H 'Content-Type: application/json' -d "$3" "http://$(node_json "$1")$2"; }

state_get() { [ -f "$STATE" ] && jq -r --arg k "$1" '.[$k] // empty' "$STATE" || true; }
state_set() {
  [ -f "$STATE" ] || echo '{}' > "$STATE"
  jq --arg k "$1" --arg v "$2" '.[$k] = $v' "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
}

wait_for_nodes() {
  say "Waiting for the three approver nodes"
  local idx attempt
  for idx in 1 2 3; do
    attempt=0
    until curl -fsS "http://$(node_http "$idx")/healthz" >/dev/null 2>&1; do
      attempt=$((attempt + 1))
      [ "$attempt" -lt 90 ] || die "decman-$idx never answered. See: docker compose logs decman-$idx"
      sleep 2
    done
    info "decman-$idx is up (participant $(node_name "$idx"))"
  done
}

# Every client authenticates as this ledger user, DecMan included: it is the
# sub claim of the demo token. The user must exist before rights are granted.
ensure_ledger_user() {
  local idx
  for idx in 1 2 3; do
    curl -fsS "${AUTH[@]}" -X POST -H 'Content-Type: application/json' \
      -d '{"user":{"id":"participant_admin","primaryParty":"","isDeactivated":false,"identityProviderId":""},"rights":[]}' \
      "http://$(node_json "$idx")/v2/users" >/dev/null 2>&1 || true
  done
}

grant_rights() {   # grant_rights <node> <party>
  cn_post "$1" /v2/users/participant_admin/rights "$(jq -n --arg p "$2" \
    '{userId: "participant_admin", identityProviderId: "", rights: [
       {kind: {CanActAs:  {value: {party: $p}}}},
       {kind: {CanReadAs: {value: {party: $p}}}}
     ]}')" >/dev/null
}

accept_invitation() {   # accept_invitation <node> <kind>
  local idx=$1 kind=$2 attempt=0 id
  info "waiting for a $kind invitation on decman-$idx"
  while [ "$attempt" -lt 120 ]; do
    id=$(dm_get "$idx" /invitations 2>/dev/null | jq -r --arg k "$kind" \
      'first(.invitations[]? | select(.invitation_type == $k) | .id) // empty' || true)
    if [ -n "$id" ]; then
      dm_post "$idx" /invitations/accept "$(jq -n --arg id "$id" '{id: $id}')" >/dev/null
      info "decman-$idx accepted it"
      return 0
    fi
    attempt=$((attempt + 1)); sleep 2
  done
  die "no $kind invitation reached decman-$idx"
}

poll_workflow() {   # poll_workflow <path> <label>
  local attempt=0 status
  while [ "$attempt" -lt 150 ]; do
    status=$(dm_get 1 "$1" 2>/dev/null | jq -r '.status // .state // empty' || true)
    case "$status" in
      Completed|completed|Complete|Success|success) info "$2: done"; return 0 ;;
      Failed|failed|Error|error) die "$2 failed; see: docker compose logs decman-1" ;;
    esac
    attempt=$((attempt + 1)); sleep 2
  done
  die "$2 did not finish in time"
}

# --- seed -------------------------------------------------------------------

peer_mesh() {
  say "Connecting the three approver nodes to each other"
  local idx peers='[]'
  for idx in 1 2 3; do
    local pid key
    pid=$(dm_get "$idx" /node-config | jq -r '.node.participant_id')
    key=$(dm_get "$idx" /keys/status | jq -r '.public_key')
    [ -n "$pid" ] && [ "$pid" != "null" ] || die "decman-$idx could not read its participant id from Canton"
    [ -n "$key" ] && [ "$key" != "null" ] || die "decman-$idx has no Noise key yet"
    state_set "PID_$idx" "$pid"
    peers=$(printf '%s' "$peers" | jq \
      --arg participant_id "$pid" --arg name "decman-$idx" \
      --arg address "decman-$idx" --argjson port "$((9000 + idx))" --arg public_key "$key" \
      '. + [{participant_id: $participant_id, name: $name, address: $address, port: $port, public_key: $public_key, party: null}]')
    info "decman-$idx is $(printf '%s' "$pid" | cut -c1-40)…"
  done
  for idx in 1 2 3; do dm_post "$idx" /network-config "$peers" >/dev/null; done
  info "peer mesh written to all three"
}

create_party() {
  local existing
  existing=$(state_get DEC_PARTY_ID)
  if [ -n "$existing" ]; then info "the party already exists: $existing"; return 0; fi

  say "Creating the decentralised party, threshold 2 of 3"
  # The peer mesh is written a moment earlier and the nodes connect to each
  # other lazily, so onboarding answers 400 until they have. Retry, and report
  # the body: curl's own exit code says nothing a reader can act on.
  local onboard tries=0 code out
  onboard=$(jq -n --arg prefix "$PARTY_PREFIX" \
    --arg p2 "$(state_get PID_2)" --arg p3 "$(state_get PID_3)" \
    '{party_id_prefix: $prefix, peer_ids: [$p2, $p3], threshold: 2}')
  while :; do
    out=$(curl -sS -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' \
          -d "$onboard" "http://$(node_http 1)/onboarding" 2>&1) || true
    code=$(printf '%s' "$out" | tail -1)
    case "$code" in 200|201|202) break ;; esac
    tries=$((tries + 1))
    [ "$tries" -lt 30 ] || die "the approver nodes would not start onboarding (HTTP $code): $(printf '%s' "$out" | head -n -1 | head -c 300)"
    sleep 2
  done
  accept_invitation 2 Onboarding
  accept_invitation 3 Onboarding
  poll_workflow /onboarding/status "the onboarding"

  local attempt=0 party
  while [ "$attempt" -lt 60 ]; do
    party=$(dm_get 1 /decentralized-parties 2>/dev/null | jq -r --arg p "$PARTY_PREFIX" \
      'first(.parties[]? | select(.party_id | startswith($p + "::")) | .party_id) // empty' || true)
    [ -n "$party" ] && break
    attempt=$((attempt + 1)); sleep 2
  done
  [ -n "$party" ] || die "the party was created but is not visible"
  state_set DEC_PARTY_ID "$party"
  info "party: $party"
}

member_parties() {
  say "Giving the party a member on each node"
  local idx member
  for idx in 1 2 3; do
    member=$(state_get "MEMBER_$idx")
    if [ -z "$member" ]; then
      member=$(cn_post "$idx" /v2/parties "$(jq -n --arg h "gov-member-$(node_name "$idx")" \
        '{party_id_hint: $h, local_metadata: {annotations: {}}}')" | jq -r '.partyDetails.party')
      [ -n "$member" ] && [ "$member" != "null" ] || die "could not allocate a member party on $(node_name "$idx")"
      state_set "MEMBER_$idx" "$member"
    fi
    grant_rights "$idx" "$member"
    grant_rights "$idx" "$(state_get DEC_PARTY_ID)"
    info "$(node_name "$idx"): $(printf '%s' "$member" | cut -c1-34)…"
  done
  for idx in 1 2 3; do
    dm_put "$idx" /party-config "$(jq -n \
      --arg dec "$(state_get DEC_PARTY_ID)" --arg member "$(state_get "MEMBER_$idx")" \
      '{dec_party_id: $dec, member_party_id: $member, user_id: "participant_admin",
        keycloak_url: "", keycloak_realm: "", keycloak_client_id: ""}')" >/dev/null
  done
}

rules_cid() {
  dm_get 1 "/governance/state?party_id=$(state_get DEC_PARTY_ID)" 2>/dev/null | jq -r '.state.contract_id // empty' || true
}

governance_core() {
  if [ -n "$(state_get RULES_CID)" ]; then info "the governance rules are already deployed"; return 0; fi
  say "Deploying the governance rules: three members, threshold 2"
  dm_get 1 /decentralized-parties >/dev/null
  dm_post 1 /contracts "$(jq -n \
    --arg dec "$(state_get DEC_PARTY_ID)" \
    --arg p1 "$(state_get PID_1)" --arg p2 "$(state_get PID_2)" --arg p3 "$(state_get PID_3)" \
    --arg m1 "$(state_get MEMBER_1)" --arg m2 "$(state_get MEMBER_2)" --arg m3 "$(state_get MEMBER_3)" \
    '{decentralized_party_id: $dec,
      participant_ids: [$p1, $p2, $p3],
      participant_parties: [$m1, $m2, $m3],
      operator_party: $m1,
      contracts: [{id: "governance-rules", name: "GovernanceRules",
        package_id: "#governance-core-v1", module_name: "Governance.Rules",
        entity_name: "GovernanceRules",
        fields: [{type: "decentralized_party"},
                 {type: "party_set", parties: [$m1, $m2, $m3]},
                 {type: "int64", value: 2},
                 {type: "rel_time", microseconds: 1800000000},
                 {type: "none"}]}]}')" >/dev/null
  accept_invitation 2 Contracts
  accept_invitation 3 Contracts
  poll_workflow /contracts/status "the rules deployment"
  local attempt=0 cid
  while [ "$attempt" -lt 30 ]; do
    cid=$(rules_cid); [ -n "$cid" ] && break
    attempt=$((attempt + 1)); sleep 2
  done
  [ -n "$cid" ] || die "the rules were deployed but no contract is visible"
  state_set RULES_CID "$cid"
  info "rules contract: $(printf '%s' "$cid" | cut -c1-34)…"
}

admit_agent() {
  [ -f "$OUT/seat.json" ] || die "no seat yet; run: docker compose up"
  local agent rules action
  agent=$(jq -r '.payingAgent' "$OUT/seat.json")
  if [ "$(state_get AGENT_ADMITTED)" = "$agent" ]; then info "the paying agent is already a proposer"; return 0; fi
  say "Admitting the paying agent as a proposer (it may propose, never confirm)"
  rules=$(rules_cid)
  action=$(jq -n --arg a "$agent" '{type: "governance_add_additional_proposer", additional_proposer: $a}')
  local n
  for n in 1 2; do
    dm_post "$n" /governance/confirm "$(jq -n --arg p "$(state_get DEC_PARTY_ID)" --arg r "$rules" \
      --argjson a "$action" '{party_id: $p, rules_contract_id: $r, action: $a, governance_type: "core_self"}')" >/dev/null
    info "decman-$n confirmed"
  done
  sleep 3
  local cids
  cids=$(dm_get 1 "/governance/confirmations?party_id=$(state_get DEC_PARTY_ID)" \
    | jq -c '[.actions[]? | select(.action.type == "governance_add_additional_proposer")
              | .confirmations[]? | .contract_id]')
  [ "$(printf '%s' "$cids" | jq 'length')" -ge 2 ] || die "expected two confirmations, got $(printf '%s' "$cids" | jq 'length')"
  dm_post 1 /governance/execute "$(jq -n --arg p "$(state_get DEC_PARTY_ID)" --arg r "$rules" \
    --argjson a "$action" --argjson c "$cids" \
    '{party_id: $p, rules_contract_id: $r, action: $a, confirmation_cids: $c, governance_type: "core_self"}')" >/dev/null
  sleep 3
  state_set RULES_CID "$(rules_cid)"
  state_set AGENT_ADMITTED "$agent"
  info "admitted"
}


# The page reads the vote from DecMan, and it needs the decentralised party's
# id to ask about. seed.sh wrote the map before this party existed, so add it
# here, once the party is real. nginx proxies /decman/ to decman-1.
publish_party() {
  local party
  party=$(state_get DEC_PARTY_ID)
  [ -n "$party" ] || die "no decentralised party to publish"
  jq --arg p "$party" '.decman = {party: $p}' "$OUT/participants.json" \
    > "$OUT/participants.json.tmp" && mv "$OUT/participants.json.tmp" "$OUT/participants.json"
  info "the page can now follow the vote"
}


# The page can file the proposal too: on a governed run its button reads
# "Ask the approvers to settle N legs". When a judge presses it there is no
# proposal.json, so find the proposal on the ledger instead - the newest
# SettleRunProposal the paying agent can see. The script and the page then
# act on the same contract whichever of them filed it.
ledger_proposal_cid() {
  local agent end
  agent=$(state_get AGENT_ADMITTED)
  [ -n "$agent" ] || return 1
  end=$(curl -fsS "${AUTH[@]}" "http://canton:5023/v2/state/ledger-end" | jq -r '.offset') || return 1
  curl -fsS "${AUTH[@]}" -X POST -H 'Content-Type: application/json' \
    -d "$(jq -n --arg p "$agent" --argjson o "$end" \
          '{filter: {filtersByParty: {($p): {cumulative: [{identifierFilter:
             {WildcardFilter: {value: {includeCreatedEventBlob: false}}}}]}}},
            verbose: false, activeAtOffset: $o}')" \
    "http://canton:5023/v2/state/active-contracts" \
    | jq -r '[.[].contractEntry.JsActiveContract.createdEvent
              | select(.templateId | endswith(":Indivisa.Governance.SettleRunProposal:SettleRunProposal"))]
             | sort_by(.offset) | last | .contractId // empty'
}

# --- the run ----------------------------------------------------------------

party_map() {
  local tmp=/tmp/pp.json name port
  echo '{}' > "$tmp"
  for name in registry agent alice bob charlie; do
    case "$name" in registry) port=5013;; agent) port=5023;; alice) port=5033;; bob) port=5043;; charlie) port=5053;; esac
    curl -fsS "${AUTH[@]}" "http://canton:$port/v2/parties" \
      | jq --arg n "$name" --slurpfile acc "$tmp" \
          '[.partyDetails[] | select(.isLocal) | {key: .party, value: $n}] | from_entries * $acc[0]' \
      > "$tmp.new" && mv "$tmp.new" "$tmp"
  done
  jq --slurpfile pp "$tmp" '.party_participants = $pp[0]' /indivisa/participants.json > /tmp/participants.json
}

# A zero-length or corrupt state file used to be silent: jq fails on it,
# state_get ends in `|| true` and returns empty, and the script carries on
# with blank ids to fail somewhere unrelated with an error about something
# else. Check it once, here. Zero length is recoverable; anything else is
# not, and says so.
if [ -f "$STATE" ] && [ ! -s "$STATE" ]; then rm -f "$STATE"; fi
if [ -f "$STATE" ] && ! jq -e . "$STATE" >/dev/null 2>&1; then
  die "$STATE is not readable JSON. Delete it and re-run: docker compose run --rm govern-seed"
fi

case "${1:-seat}" in
  seat)
    wait_for_nodes
    ensure_ledger_user
    peer_mesh
    create_party
    member_parties
    governance_core
    admit_agent
    publish_party
    say "Ready. The approvers exist and the paying agent may propose."
    printf '    party  %s\n    rules  %s\n\n    Next:  docker compose run --rm govern prepare\n\n' \
      "$(state_get DEC_PARTY_ID)" "$(state_get RULES_CID)"
    ;;

  prepare)
    [ -n "$(state_get DEC_PARTY_ID)" ] || die "run: docker compose run --rm govern-seed"
    party_map
    say "Naming the approver on the run and making every allocation ready"
    jq -n --slurpfile s "$OUT/seat.json" --arg a "$(state_get DEC_PARTY_ID)" \
      '{seat: $s[0], withhold: 0, approver: $a}' > /tmp/prepare-args.json
    "${RUNNER[@]}" --dar /indivisa/indivisa-test-0.1.0.dar \
      --script-name Indivisa.Test.Demo:demo_prepare \
      --input-file /tmp/prepare-args.json --output-file "$OUT/prepared.json" \
      --participant-config /tmp/participants.json
    say "Done. The run now needs the approvers, not just the paying agent."
    printf '    Open http://localhost:8080. The button no longer settles: it reads
    "Ask the approvers to settle 20 legs", because the agent cannot act alone.
    Press it, then: docker compose run --rm govern confirm 1

'
    ;;

  propose)
    [ -f "$OUT/prepared.json" ] || die "run: docker compose run --rm govern prepare"
    party_map
    say "The paying agent files the proposal"
    jq -n --slurpfile p "$OUT/prepared.json" --arg a "$(state_get DEC_PARTY_ID)" \
      '{prepared: $p[0], approver: $a}' > /tmp/propose-args.json
    "${RUNNER[@]}" --dar "$DAR" \
      --script-name Indivisa.Governance.Demo:govern_propose \
      --input-file /tmp/propose-args.json --output-file "$OUT/proposal.json" \
      --participant-config /tmp/participants.json
    say "Filed. Now two of the three approvers must confirm."
    printf '    docker compose run --rm govern confirm 1\n    docker compose run --rm govern execute 2   <- refused, one is not enough\n    docker compose run --rm govern confirm 2\n    docker compose run --rm govern execute 3   <- settles\n\n'
    ;;

  confirm|execute)
    cmd=$1; node="${2:-1}"
    dec=$(state_get DEC_PARTY_ID); rules=$(rules_cid)
    if [ -f "$OUT/proposal.json" ]; then
      cid=$(jq -r '.actionCid // empty' "$OUT/proposal.json")
    else
      cid=$(ledger_proposal_cid || true)
    fi
    [ -n "$cid" ] || die "nothing has been proposed yet. Press \"Ask the approvers\" on the page, or run: docker compose run --rm govern propose"

    # The engine identifies a domain action by proposal_cid. The action field
    # is required by the request schema and ignored in this mode, so it
    # carries a placeholder - the same one infra/govern.ps1 sends.
    placeholder='{"type": "governance_set_threshold", "new_threshold": 0}'

    if [ "$cmd" = "confirm" ]; then
      say "Approver node $node confirms"
      dm_post "$node" /governance/confirm "$(jq -n --arg p "$dec" --arg r "$rules" --arg c "$cid" \
        --argjson a "$placeholder" \
        '{party_id: $p, rules_contract_id: $r, action: $a, governance_type: "core_domain", proposal_cid: $c}')" \
        >/dev/null
      have=$(dm_get 1 "/governance/confirmations?party_id=$dec" \
        | jq --arg c "$cid" '[.domain_actions[]? | select(.proposal_cid == $c) | .confirmations[]?] | length')
      printf '    %s of the 2 required confirmations are in\n\n' "${have:-0}"
      exit 0
    fi

    # --- execute ------------------------------------------------------------
    say "Approver node $node tries to execute"
    entry=$(dm_get 1 "/governance/confirmations?party_id=$dec" \
      | jq -c --arg c "$cid" 'first(.domain_actions[]? | select(.proposal_cid == $c)) // {}')
    cids=$(printf '%s' "$entry" | jq -c '[.confirmations[]? | .contract_id]')
    can=$(printf '%s' "$entry" | jq -r '.can_execute // false')
    info "confirmations: $(printf '%s' "$cids" | jq 'length') of 2   can_execute: $can"

    # The executing node runs Run_Settle, which touches the cash registry's
    # rules and the agent's locked holdings. Neither lives on this node, so
    # both are disclosed with the blobs the ledger returns.
    blobs() {   # blobs <json-port> <party> <template-id> <jq filter>
      local end_off
      end_off=$(curl -fsS "${AUTH[@]}" "http://canton:$1/v2/state/ledger-end" | jq -r '.offset')
      curl -fsS "${AUTH[@]}" -X POST -H 'Content-Type: application/json' \
        -d "$(jq -n --arg party "$2" --arg tid "$3" --argjson off "$end_off" \
          '{eventFormat: {filtersByParty: {($party): {cumulative: [{identifierFilter: {TemplateFilter: {value: {templateId: $tid, includeCreatedEventBlob: true}}}}]}}, verbose: false}, activeAtOffset: $off}')" \
        "http://canton:$1/v2/state/active-contracts" \
        | jq -c "[.[] | .contractEntry.JsActiveContract.createdEvent | select(. != null) | $4 | {contract_id: .contractId, blob: .createdEventBlob}]"
    }

    registry=$(jq -r '.registry' "$OUT/seat.json")
    agent=$(jq -r '.payingAgent' "$OUT/seat.json")
    rules_cid_seat=$(jq -r '.rulesCid' "$OUT/seat.json")
    disc_rules=$(blobs 5013 "$registry" '#splice-test-token-v2:Splice.Testing.Tokens.TestTokenV2:TokenRules' \
      "select(.contractId == \"$rules_cid_seat\")")
    disc_locked=$(blobs 5023 "$agent" '#splice-test-token-v2:Splice.Testing.Tokens.TestTokenV2.Holding:Token' \
      'select(.createArgument.holding.lock != null)')
    disclosed=$(jq -c -n --argjson a "$disc_rules" --argjson b "$disc_locked" '$a + $b')
    info "disclosing $(printf '%s' "$disclosed" | jq 'length') contract(s): the cash rules and the locked holdings"

    body=$(jq -n --arg p "$dec" --arg r "$rules" --arg c "$cid" --argjson a "$placeholder" \
      --argjson cids "$cids" --argjson disc "$disclosed" \
      '{party_id: $p, rules_contract_id: $r, action: $a, confirmation_cids: $cids,
        disclosed_contracts: $disc, governance_type: "core_domain", proposal_cid: $c}')

    if out=$(curl -sS -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' \
             -d "$body" "http://$(node_http "$node")/governance/execute" 2>&1); then
      code=$(printf '%s' "$out" | tail -1)
      if [ "$code" = "200" ]; then
        printf '\n    EXECUTED. Every holder paid, in one transaction, and only because two\n    approvers agreed. The paying agent could not do this alone.\n\n'
        exit 0
      fi
      printf '\n    REFUSED by the governance engine (HTTP %s):\n    %s\n\n' \
        "$code" "$(printf '%s' "$out" | head -n -1 | head -c 400)"
      exit 0
    fi
    printf '\n    The call itself failed; the node may be down.\n\n'
    exit 1
    ;;

  status)
    dec=$(state_get DEC_PARTY_ID)
    printf 'decentralised party  %s\nrules contract       %s\n' "${dec:-<not seeded>}" "$(rules_cid)"
    for n in 1 2 3; do printf 'member %d (%s)  %s\n' "$n" "$(node_name "$n")" "$(state_get "MEMBER_$n")"; done
    [ -n "$dec" ] && dm_get 1 "/governance/confirmations?party_id=$dec" | jq '{pending: [.actions[]? | {type: .action.type, confirmations: (.confirmations | length)}]}'
    ;;

  *) die "usage: govern.sh [seat|prepare|propose|confirm N|execute N|status]" ;;
esac
