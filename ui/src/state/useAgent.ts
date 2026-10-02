// The executor's connection: everything the paying agent can see, and the
// one command it can send. Held at the top of the app because four tabs and
// the action bar all read from it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ledger, LedgerError } from "../ledger/client";
import { agentState, factoryDisclosure, proposeSettlement,
  withdrawProposal,
  cancelRun, recordRejection, settle, type AgentState } from "../ledger/queries";
import type { Config } from "../config";

export const POLL_MS = 2000;

export type Pressed =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "settled"; updateId: string; ms: number }
  | { kind: "proposed"; ms: number }
  | { kind: "rejected"; reason: string };

export interface AgentHandle {
  state: AgentState | null;
  error: string | null;
  pressed: Pressed;
  /** When the last successful poll landed, so the header can say how fresh this is. */
  lastAt: number | null;
  refresh: () => Promise<void>;
  onSettle: () => Promise<void>;
  /** Archive a request the agent filed by mistake. Only before it executes. */
  onWithdraw: () => Promise<void>;
  /** Release the cash a prepared run has locked, before it is even asked for. */
  onCancelRun: () => Promise<void>;
  /** The two connections, so the vote can reuse them rather than open its own. */
  ledgers: { agent: Ledger; registry: Ledger };
}

export function useAgent(config: Config): AgentHandle {
  const { seat } = config;
  const agent = useMemo(
    () => new Ledger(config.baseOf(config.participantOf(seat.payingAgent)), seat.payingAgent),
    [config, seat.payingAgent],
  );
  const registry = useMemo(
    () => new Ledger(config.baseOf(config.participantOf(seat.registry)), seat.registry),
    [config, seat.registry],
  );

  const [state, setState] = useState<AgentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [pressed, setPressed] = useState<Pressed>({ kind: "idle" });
  const failures = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setState(await agentState(agent, seat.runId, seat.isin));
      setError(null);
      setLastAt(Date.now());
      failures.current = 0;
    } catch (e) {
      // One failed poll is noise (the proxy, a busy node); two in a row is worth showing.
      failures.current += 1;
      if (failures.current >= 2) setError(String(e));
    }
  }, [agent, seat.runId, seat.isin]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const onSettle = useCallback(async () => {
    if (!state?.run) return;
    setPressed({ kind: "busy" });
    try {
      // A run that names an approver is not the agent's to settle. The button
      // asks instead: it signs a request the approvers confirm on their own
      // nodes. Pressing the settle anyway would be refused by the ledger,
      // which is a correct answer to a question an interface should not have
      // let anyone ask.
      if (state.run.approver) {
        const t0 = performance.now();
        const currency = state.instrument?.currency ?? "";
        const description =
          `Settle ${seat.runId}: ${state.run.legs} legs, ${state.run.total.toFixed(2)} ${currency}`.trim();
        await proposeSettlement(
          agent,
          state.run.approver,
          state.run.cid,
          state.allocations.map((a) => a.cid),
          seat.rulesCid,
          description,
        );
        setPressed({ kind: "proposed", ms: Math.round(performance.now() - t0) });
        return;
      }
      const factory = await factoryDisclosure(registry, seat.rulesCid);
      const r = await settle(agent, state.run.cid, state.allocations.map((a) => a.cid), seat.rulesCid, factory);
      setPressed({ kind: "settled", updateId: r.updateId, ms: r.ms });
    } catch (e) {
      const reason = e instanceof LedgerError ? extractReason(e.body) : String(e);
      setPressed({ kind: "rejected", reason });
      try {
        await recordRejection(agent, seat.runId, state.run.legs, reason);
      } catch {
        // The record is a courtesy for the audit trail; the refusal stands either way.
      }
    } finally {
      refresh();
    }
  }, [agent, registry, refresh, seat.rulesCid, seat.runId, state]);

  const onWithdraw = useCallback(async () => {
    if (!state?.proposal) return;
    setPressed({ kind: "busy" });
    try {
      await withdrawProposal(agent, state.proposal.cid);
      // Back to the state before the button was pressed: the run is prepared,
      // nothing is outstanding, and the agent may ask again when it is ready.
      setPressed({ kind: "idle" });
    } catch (e) {
      const reason = e instanceof LedgerError ? extractReason(e.body) : String(e);
      setPressed({ kind: "rejected", reason });
    } finally {
      refresh();
    }
  }, [agent, refresh, state]);

  const onCancelRun = useCallback(async () => {
    const send = state?.allocations.find((a) => a.isSend);
    if (!send) return;
    setPressed({ kind: "busy" });
    try {
      // The same disclosure the settle needs: the choice runs the registry own
      // code, and the executing participant has never seen its rules contract.
      const factory = await factoryDisclosure(registry, seat.rulesCid);
      await cancelRun(agent, send.cid, seat.rulesCid, factory);
      setPressed({ kind: "idle" });
    } catch (e) {
      const reason = e instanceof LedgerError ? extractReason(e.body) : String(e);
      setPressed({ kind: "rejected", reason });
    } finally {
      refresh();
    }
  }, [agent, registry, refresh, seat.rulesCid, state]);

  return { state, error, pressed, lastAt, refresh, onSettle, onWithdraw, onCancelRun, ledgers: { agent, registry } };
}

function extractReason(body: string): string {
  try {
    const j = JSON.parse(body);
    return j.cause ?? j.message ?? body;
  } catch {
    return body;
  }
}
