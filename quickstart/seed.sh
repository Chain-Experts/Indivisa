#!/usr/bin/env bash
# Seat the demo, or prepare a run, against the canton container.
#
#   seed.sh seat      once: parties, the bond, the register, onboarding,
#                     the schedule, then the allocations with one holder
#                     deliberately withheld, so the first press is refused
#   seed.sh prepare   create the one allocation that was withheld
#
# Output lands in /demo, a volume the web container serves at /demo/*.
set -euo pipefail

# This network authenticates with one unsafe, non-expiring demo token (see
# quickstart/canton.conf). Public on purpose: the network is local and holds
# nothing of value. Only Canton wants it - the approver nodes mint their own.
AUTH=(-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwYXJ0aWNpcGFudF9hZG1pbiIsImF1ZCI6Imh0dHBzOi8vY2FudG9uLm5ldHdvcmsuZ2xvYmFsIiwiZXhwIjo0MDcwOTA4ODAwfQ.WOS0ZzNrmPtZZaPJXHF8VpF6HKs2r26F_JTG1CUGg08")

HOLDERS="${INDIVISA_HOLDERS:-20}"
TAG="${INDIVISA_TAG:-demo}"
DAR=/indivisa/indivisa-test-0.1.0.dar
OUT=/demo
RUNNER=(java -jar /opt/daml-script.jar)

say() { printf '\n==> %s\n' "$*"; }

wait_for_ledger() {
  say "Waiting for the ledger"
  for _ in $(seq 1 180); do
    if curl -fsS "${AUTH[@]}" "http://canton:5023/v2/state/ledger-end" >/dev/null 2>&1 \
    && curl -fsS "${AUTH[@]}" "http://canton:5053/v2/state/ledger-end" >/dev/null 2>&1; then
      echo "    all five participants are answering"
      return 0
    fi
    sleep 2
  done
  echo "the ledger did not come up; see: docker compose logs canton" >&2
  exit 1
}

# Every party the scripts create must be routable by name on the next run,
# so the map is rebuilt from the ledger each time (the runner only knows
# parties it allocated itself).
party_map() {
  local tmp=/tmp/party_participants.json
  echo '{}' > "$tmp"
  for name in registry agent alice bob charlie; do
    local port
    case "$name" in
      registry) port=5013 ;; agent) port=5023 ;; alice) port=5033 ;;
      bob) port=5043 ;; charlie) port=5053 ;;
    esac
    curl -fsS "${AUTH[@]}" "http://canton:$port/v2/parties" \
      | jq --arg n "$name" --slurpfile acc "$tmp" \
          '[.partyDetails[] | select(.isLocal) | {key: .party, value: $n}] | from_entries * $acc[0]' \
      > "$tmp.new" && mv "$tmp.new" "$tmp"
  done
  jq --slurpfile pp "$tmp" '.party_participants = $pp[0]' /indivisa/participants.json > /tmp/participants.json
}

case "${1:-seat}" in
  seat)
    wait_for_ledger
    # The seat names parties on a particular ledger, and it outlives the
    # ledger: `docker compose down` throws away Canton but keeps the /demo
    # volume, so a plain `up` would serve a seat whose parties no longer
    # exist. The participant id carries a fingerprint of keys generated at
    # bootstrap, so it changes with every fresh Canton; compare and re-seat.
    instance="$(curl -fsS "${AUTH[@]}" http://canton:5023/v2/parties/participant-id | jq -r .participantId)"
    if [ -f "$OUT/seat.json" ]; then
      if [ "$(cat "$OUT/instance" 2>/dev/null || true)" = "$instance" ]; then
        say "Already seated on this ledger; nothing to do"
        exit 0
      fi
      say "The seat belongs to an earlier ledger; seating again"
      rm -f "$OUT/seat.json" "$OUT/prepared.json" "$OUT/participants.json" "$OUT/instance"
    fi
    party_map
    say "Seating $HOLDERS holders (a party takes a few seconds; this is the slow part)"
    printf '{"topology":"LocalNet","holders":%s,"tag":"%s","user":"participant_admin"}' "$HOLDERS" "$TAG" > /tmp/seat-args.json
    "${RUNNER[@]}" --dar "$DAR" \
      --script-name Indivisa.Test.Demo:demo_seat \
      --input-file /tmp/seat-args.json --output-file "$OUT/seat.json" \
      --participant-config /tmp/participants.json

    party_map
    # The governed demo needs the run created with its approver named, and
    # DistributionRun is created once per run id and then reused. So when the
    # governed path is wanted, the seat stops here and `govern prepare`
    # creates the run instead.
    if [ -n "${INDIVISA_GOVERNED:-}" ]; then
      jq "{network: \"demo\", readOnly: false, party_participants: .party_participants, userId: .default_participant.user_id}"         /tmp/participants.json > "$OUT/participants.json"
      printf %s "$instance" > "$OUT/instance"
      say "Seated. The run itself is created by the governed path."
      printf "    Next:  docker compose run --rm govern-seed

"
      exit 0
    fi
    say "Preparing the run, with one holder deliberately left out"
    jq -n --slurpfile s "$OUT/seat.json" '{seat: $s[0], withhold: 1, approver: null}' > /tmp/prepare-args.json
    "${RUNNER[@]}" --dar "$DAR" \
      --script-name Indivisa.Test.Demo:demo_prepare \
      --input-file /tmp/prepare-args.json --output-file "$OUT/prepared.json" \
      --participant-config /tmp/participants.json

    # What the page needs: party -> participant, and the ledger user to
    # submit as. Canton is authenticated here and takes the user from the
    # token subject, refusing a command that names a different one - with an
    # error that deliberately says nothing. Never let the page guess it.
    jq '{network: "demo", readOnly: false, party_participants: .party_participants, userId: .default_participant.user_id}' \
      /tmp/participants.json > "$OUT/participants.json"
    printf %s "$instance" > "$OUT/instance"
    say "Ready. Open http://localhost:${INDIVISA_PORT:-8080} and press the button."
    ;;

  prepare)
    [ -f "$OUT/seat.json" ] || { echo "not seated yet; run: docker compose up" >&2; exit 1; }
    instance="$(curl -fsS "${AUTH[@]}" http://canton:5023/v2/parties/participant-id | jq -r .participantId)"
    if [ "$(cat "$OUT/instance" 2>/dev/null || true)" != "$instance" ]; then
      echo "the seat belongs to an earlier ledger; run: docker compose down && docker compose up" >&2
      exit 1
    fi
    party_map
    say "Creating the allocation that was withheld"
    jq -n --slurpfile s "$OUT/seat.json" '{seat: $s[0], withhold: 0, approver: null}' > /tmp/prepare-args.json
    "${RUNNER[@]}" --dar "$DAR" \
      --script-name Indivisa.Test.Demo:demo_prepare \
      --input-file /tmp/prepare-args.json --output-file "$OUT/prepared.json" \
      --participant-config /tmp/participants.json
    say "Done. The page shows every allocation ready; press the button again."
    ;;

  *) echo "usage: seed.sh [seat|prepare]" >&2; exit 2 ;;
esac
