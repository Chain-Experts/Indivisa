// The approvers' vote, polled while a proposal is outstanding.
//
// Separate from useAgent because it reads a different system: useAgent reads
// the ledger, this reads the Decentralization Manager. They can disagree for
// a second or two after an execute, and that is fine - the ledger is the one
// that settles anything.

import { useCallback, useEffect, useRef, useState } from "react";
import { execute, vote, type Vote } from "../ledger/decman";
import { executeDisclosures } from "../ledger/queries";
import type { Ledger, ContractId } from "../ledger/client";

export const VOTE_POLL_MS = 3000;

export type Executing = { kind: "idle" } | { kind: "busy" } | { kind: "failed"; reason: string };

export interface VoteHandle {
  vote: Vote | null;
  /** The request being voted on, so the approvers desk can confirm it. */
  proposalCid: ContractId | null;
  /** Null until the first poll answers; a string when DecMan cannot be reached. */
  error: string | null;
  executing: Executing;
  onExecute: () => Promise<void>;
}

export function useVote(
  party: string | null,
  proposalCid: ContractId | null,
  agent: Ledger,
  registry: Ledger,
  rulesCid: ContractId,
  refreshLedger: () => Promise<void>,
): VoteHandle {
  const [v, setV] = useState<Vote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<Executing>({ kind: "idle" });
  const failures = useRef(0);

  const poll = useCallback(async () => {
    if (!party || !proposalCid) {
      setV(null);
      return;
    }
    try {
      setV(await vote(party, proposalCid));
      setError(null);
      failures.current = 0;
    } catch (e) {
      // The usual cause is a DecMan token that has expired or was never
      // pasted in. Say so once rather than on every poll: it is a setup
      // problem, not a fault in the run.
      failures.current += 1;
      if (failures.current >= 2) {
        setError(decManHint(e));
        // Drop the last good answer too. Keeping it showed a stale count with
        // no sign anything was wrong: the page said 0 of 2 while DecMan had
        // 1 of 2 and was refusing us (1 Oct). A number nobody can refresh is
        // worse than no number.
        setV(null);
      }
    }
  }, [party, proposalCid]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, VOTE_POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  const onExecute = useCallback(async () => {
    if (!party || !proposalCid || !v?.canExecute) return;
    setExecuting({ kind: "busy" });
    try {
      const disclosed = await executeDisclosures(agent, registry, rulesCid);
      await execute(party, v, proposalCid, disclosed);
      setExecuting({ kind: "idle" });
    } catch (e) {
      setExecuting({ kind: "failed", reason: decManHint(e) });
    } finally {
      // The receipt lands on the ledger, not here.
      await refreshLedger();
      await poll();
    }
  }, [agent, party, poll, proposalCid, refreshLedger, registry, rulesCid, v]);

  return { vote: v, proposalCid, error, executing, onExecute };
}

function decManHint(e: unknown): string {
  const s = String(e);
  if (s.includes("401") || s.includes("403") || s.includes("not active")) {
    return "The Decentralization Manager rejected the token. Put the REFRESH token from its console (dec_party_manager_refresh_token) into infra/<network>/decman-refresh.txt and restart the dev server; it then keeps itself current.";
  }
  return s;
}
