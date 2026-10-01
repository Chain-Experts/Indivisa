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
  /** The live governance rules contract; it changes with every self-action. */
  rulesCid: string;
}

export interface DisclosedForExecute {
  contract_id: string;
  blob: string;
}

async function get<R>(path: string): Promise<R> {
  const r = await fetch(`/decman${path}`, { headers: { Accept: "application/json" } });
  const text = await r.text();
  if (!r.ok) throw new DecManError(r.status, text);
  return JSON.parse(text) as R;
}

async function post<R>(path: string, body: unknown): Promise<R> {
  const r = await fetch(`/decman${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    get<{ domain_actions?: { proposal_cid: string; can_execute?: boolean; confirmations?: { contract_id: string }[] }[] }>(
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
    rulesCid: state.state.contract_id,
  };
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
