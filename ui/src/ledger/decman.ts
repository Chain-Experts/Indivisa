// The approvers' vote, read and acted on through BitSafe's Decentralization
// Manager.
//
// Everything here goes to /decman/..., which the dev server (and nginx in
// production) proxies to the Decentralization Manager, adding the bearer
// token on the way through. The browser never holds that token, for the same
// reason it never holds a ledger token.
//
// What this file does NOT do, deliberately: confirm. A confirmation is cast
// by a member on that member's own node, in that member's own
// Decentralization Manager. An approver confirming through software the
// proposer wrote and hosts would hollow out the only claim the governed path
// makes. The page proposes and, once the threshold is met, executes. The
// agreeing happens elsewhere, and should.

import { operatorHeaders, type Party } from "./client";

export class DecManError extends Error {
  constructor(public status: number, public body: string) {
    super(`DecMan ${status}: ${body.slice(0, 300)}`);
  }
}

export interface Vote {
  /** Confirmations cast so far for this proposal. */
  confirmations: number;
  /** How many the rules require. */
  threshold: number;
  /** DecMan's own verdict, which is the one that matters. */
  canExecute: boolean;
  /** The contract ids of the confirmations, needed to execute. */
  confirmationCids: string[];
  /** The member parties that have confirmed. The approvers desk shows a row
   *  per member, so a count is not enough. */
  confirmedBy: Party[];
  /** The live governance rules contract; it changes with every self-action. */
  rulesCid: string;
}

/** Who the approvers actually are, before anybody has been asked anything. */
export interface Committee {
  /** The decentralised party itself. */
  party: string;
  /** Its member parties, one per Decentralization Manager node. */
  members: string[];
  /** How many of them have to confirm. */
  threshold: number;
}

/**
 * The committee, read from the live governance rules.
 *
 * This exists because the operator was being asked to put a payment under the
 * approvers' control through a checkbox that named nobody: it said "needs the
 * approvers" and left who they are, how many there are and how many have to
 * agree entirely unstated. That is the one decision on the panel with a
 * consequence outside this company, and it was the least informative control
 * on the page.
 *
 * `vote()` cannot answer it: confirmations exist only once a proposal has
 * been filed, and this has to be legible before the run is created. The rules
 * contract carries the membership and the threshold from the moment the party
 * is deployed, which is what makes it readable up front.
 *
 * Returns null where there is nothing to say: no Decentralization Manager
 * configured, or a party whose rules are not deployed yet. The caller offers
 * the choice either way, because the choice is real whether or not the names
 * can be read.
 */
export async function committee(party: string): Promise<Committee | null> {
  const r = await get<{ state: { governance_party?: string; members?: string[]; threshold?: number } | null }>(
    `/governance/state?party_id=${encodeURIComponent(party)}`,
  );
  const s = r.state;
  if (!s || !s.members?.length || !s.threshold) return null;
  return { party: s.governance_party ?? party, members: s.members, threshold: s.threshold };
}

export interface DisclosedForExecute {
  contract_id: string;
  blob: string;
}

async function get<R>(path: string): Promise<R> {
  const r = await fetch(`/decman${path}`, { headers: { Accept: "application/json", ...operatorHeaders() } });
  const text = await r.text();
  if (!r.ok) throw new DecManError(r.status, text);
  return JSON.parse(text) as R;
}

async function post<R>(path: string, body: unknown): Promise<R> {
  const r = await fetch(`/decman${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...operatorHeaders() },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new DecManError(r.status, text);
  return text ? (JSON.parse(text) as R) : ({} as R);
}

/**
 * Where the vote on one proposal stands.
 *
 * A custom action's confirmations come back under `domain_actions`, matched on
 * `proposal_cid` - not under `actions`, which carries the rules' own
 * self-governance votes. Returns null when DecMan has no pending action for
 * this proposal, which is the normal state once it has executed.
 */
export async function vote(party: string, proposalCid: string): Promise<Vote | null> {
  const [state, conf] = await Promise.all([
    get<{ state: { contract_id: string; threshold: number } }>(
      `/governance/state?party_id=${encodeURIComponent(party)}`,
    ),
    get<{ domain_actions?: { proposal_cid: string; can_execute?: boolean; confirmations?: { contract_id: string; confirming_party?: Party }[] }[] }>(
      `/governance/confirmations?party_id=${encodeURIComponent(party)}`,
    ),
  ]);
  const entry = (conf.domain_actions ?? []).find((a) => a.proposal_cid === proposalCid);
  if (!entry) return null;
  const cids = (entry.confirmations ?? []).map((c) => c.contract_id);
  return {
    confirmations: cids.length,
    threshold: state.state.threshold,
    canExecute: !!entry.can_execute,
    confirmationCids: cids,
    confirmedBy: (entry.confirmations ?? []).map((c) => c.confirming_party).filter((p): p is Party => !!p),
    rulesCid: state.state.contract_id,
  };
}

/**
 * One member confirms, on that member's own node.
 *
 * This posts to `/decman/<node>/`, which the web server routes to that
 * approver's own Decentralization Manager. The confirmation is a contract
 * **that member** signs: this is a client calling the member's node, exactly
 * as `govern.sh confirm N` is, and the authority is the node's rather than
 * the page's.
 *
 * It is here under protest, and the page that calls it says so. The reason it
 * is defensible is that the alternative was `docker compose run --rm govern
 * confirm 1`, which is the same POST from a script we also wrote: in a demo
 * that deliberately holds every party's credential, a button is no weaker
 * than a shell command, and the guarantee being demonstrated lives on the
 * ledger rather than in who clicked. The threshold is enforced by the
 * governance rules, and an execute below it is refused by Canton.
 *
 * **It exists only where `approverNodes` is published**, which is the judges'
 * local stack. On a real deployment there is no route to another company's
 * node and the button is absent, which is the honest shape.
 *
 * Why a member cannot simply do this in its own manager instead: v1.8.0's UI
 * does not surface a custom domain action under Approvals at all. Measured on
 * 8 October - node 1's own API reported the pending proposal while its own
 * Approvals view read "Needs you 0". That is a fourth finding for BitSafe,
 * and the same family as the three already offered on #516.
 */
export async function confirmAs(
  node: string,
  party: string,
  rulesCid: string,
  proposalCid: string,
): Promise<void> {
  await post(`/${node}/governance/confirm`, {
    party_id: party,
    rules_contract_id: rulesCid,
    // The schema demands an action and ignores it for core_domain, where
    // proposal_cid identifies the work. BitSafe's own UI sends the same
    // placeholder; see CUSTOM_DAML_TEMPLATES.md.
    action: { type: "governance_set_threshold", new_threshold: 0 },
    governance_type: "core_domain",
    proposal_cid: proposalCid,
  });
}

/**
 * Execute the settlement, once the approvers have agreed.
 *
 * The executing node runs the action's `executeImpl`, which reaches the
 * registry's rules and the agent's locked cash - contracts that node has
 * never seen - so they travel with the request.
 *
 * `action` carries a placeholder: the request schema demands the field and
 * ignores it for `core_domain`, where `proposal_cid` identifies the work.
 * That is the least guessable thing about this API and it is documented in
 * BitSafe's own CUSTOM_DAML_TEMPLATES.md.
 */
export async function execute(
  party: string,
  v: Vote,
  proposalCid: string,
  disclosed: DisclosedForExecute[],
): Promise<void> {
  await post("/governance/execute", {
    party_id: party,
    rules_contract_id: v.rulesCid,
    action: { type: "governance_set_threshold", new_threshold: 0 },
    confirmation_cids: v.confirmationCids,
    disclosed_contracts: disclosed,
    governance_type: "core_domain",
    proposal_cid: proposalCid,
  });
}
