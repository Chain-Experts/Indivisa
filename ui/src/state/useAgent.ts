// The executor's connection: everything the paying agent can see, and the
// one command it can send. Held at the top of the app because four tabs and
// the action bar all read from it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ledger, LedgerError, type Party } from "../ledger/client";
import { agentState, factoryDisclosure, proposeSettlement,
  withdrawProposal,
  cancelRun, recordRejection, settle, allocateMissing,
  announce, freezeRegister, entitle, createRun, runIdFor,
  type AgentState, type CouponTerms } from "../ledger/queries";
import type { Config } from "../config";

export const POLL_MS = 2000;

export type Pressed =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "settled"; updateId: string; ms: number }
  | { kind: "proposed"; ms: number }
  | { kind: "rejected"; reason: string }
  | { kind: "failed"; what: "cancel" | "prepare" | "coupon"; reason: string };

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
  /** Create the allocations the run is still missing. Safe to press twice. */
  onPrepare: () => Promise<void>;
  /** Announce, freeze, derive and create the run, in that order. Each step is
   *  idempotent, so this both sets a coupon up from scratch and finishes one
   *  that stopped half way. `approver` set makes the run governed. */
  onSetUpCoupon: (terms: CouponTerms, approver: Party | null) => Promise<void>;
  /** The run the page is reading. Starts as the seat's and follows the page
   *  when it sets up a later coupon, which has a run id of its own. */
  runId: string;
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
  // The announcement is the issuer's contract, not the agent's. The console
  // can submit it only because it is a harness holding every credential, and
  // the panel that offers it says so.
  const issuer = useMemo(
    () => new Ledger(config.baseOf(config.participantOf(seat.issuer)), seat.issuer),
    [config, seat.issuer],
  );

  // The seat names one run. Setting up a later coupon makes another, with a
  // run id derived from its own payment date, and the page follows it.
  const [runId, setRunId] = useState(seat.runId);
  const [state, setState] = useState<AgentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [pressed, setPressed] = useState<Pressed>({ kind: "idle" });
  const failures = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setState(await agentState(agent, runId, seat.isin));
      setError(null);
      setLastAt(Date.now());
      failures.current = 0;
    } catch (e) {
      // One failed poll is noise (the proxy, a busy node); two in a row is worth showing.
      failures.current += 1;
      if (failures.current >= 2) setError(String(e));
    }
  }, [agent, runId, seat.isin]);

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
          `Settle ${runId}: ${state.run.legs} legs, ${state.run.total.toFixed(2)} ${currency}`.trim();
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
        await recordRejection(agent, runId, state.run.legs, reason);
      } catch {
        // The record is a courtesy for the audit trail; the refusal stands either way.
      }
    } finally {
      refresh();
    }
  }, [agent, registry, refresh, seat.rulesCid, runId, state]);

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
    if (!send || !state?.run) return;
    // Cancelling a committed allocation is an executors action, and the
    // executors are the agent plus the approver when there is one.
    const executors = [agent.party, ...(state.run.approver ? [state.run.approver] : [])];
    setPressed({ kind: "busy" });
    try {
      // The same disclosure the settle needs: the choice runs the registry own
      // code, and the executing participant has never seen its rules contract.
      const factory = await factoryDisclosure(registry, seat.rulesCid);
      await cancelRun(agent, send.cid, executors, seat.rulesCid, factory);
      setPressed({ kind: "idle" });
    } catch (e) {
      const reason = e instanceof LedgerError ? extractReason(e.body) : String(e);
      // Deliberately NOT "rejected": that strip says SETTLEMENT REJECTED, and
      // a refused cancellation is not a refused settlement. Saying so cost
      // real confusion on 2 October.
      setPressed({ kind: "failed", what: "cancel", reason });
    } finally {
      refresh();
    }
  }, [agent, registry, refresh, seat.rulesCid, state]);

  // Create whatever the run is still missing. This is the step that used to
  // be `docker compose run --rm prepare` or `demo.ps1 prepare`, and it is the
  // agent's own work: the receipts go through each holder's standing
  // agreement, so no holder is involved.
  //
  // Deliberately NOT disabled once pressed. `allocateMissing` creates only
  // what is absent, so a second press after a partial failure finishes the job
  // instead of duplicating it, and an operator who cannot tell what landed
  // should be able to press again.
  const onPrepare = useCallback(async () => {
    if (!state?.run) return;
    setPressed({ kind: "busy" });
    try {
      // The registry's rules contract: the agent's participant has never seen
      // it, so it travels with the request, exactly as the settle's does.
      const factory = await factoryDisclosure(registry, seat.rulesCid);
      await allocateMissing(agent, state.run.cid, state.allocations, seat.rulesCid, factory);
      setPressed({ kind: "idle" });
    } catch (e) {
      const reason = e instanceof LedgerError ? extractReason(e.body) : String(e);
      // Not "rejected": that strip says SETTLEMENT REJECTED, and a failed
      // preparation is not a refused settlement. The same distinction the
      // cancel path had to learn on 2 October.
      setPressed({ kind: "failed", what: "prepare", reason });
    } finally {
      refresh();
    }
  }, [agent, registry, refresh, seat.rulesCid, state]);

  // Announce, freeze, derive, create the run. The four steps that were
  // `demo.ps1 seat` and `govern prepare`, in the order the model requires and
  // with each one idempotent, so pressing it again after a failure finishes
  // the job instead of filing a second announcement.
  //
  // The first step submits as the ISSUER. That is somebody else's contract in
  // a deployment, and the console can do it only because it is a harness that
  // holds every party's credential. The panel offering this says so.
  const onSetUpCoupon = useCallback(async (terms: CouponTerms, approver: Party | null) => {
    const isin = seat.isin;
    const currency = state?.instrument?.currency;
    const kind = state?.schedule?.kind ?? "Coupon";
    if (!currency) {
      setPressed({ kind: "failed", what: "coupon", reason: "the instrument has not been read yet; wait for the page to load" });
      return;
    }
    setPressed({ kind: "busy" });
    // Which step failed matters more than the message: an operator can act on
    // "the register could not be frozen" and cannot act on a bare stack trace.
    let step = "announce the event";
    try {
      const actionCid = await announce(issuer, agent.party, isin, kind, currency, terms);
      step = "freeze the register";
      const snapshotCid = await freezeRegister(agent, isin, terms.recordDate);
      step = "derive the schedule";
      const scheduleCid = await entitle(agent, actionCid, snapshotCid, isin, terms.paymentDate, terms.policy);
      step = "create the run";
      const fresh = await agentState(agent, runIdFor(isin, kind, terms.paymentDate), isin);
      if (!fresh.schedule) throw new Error("the schedule was derived but the page could not read it back");
      const id = await createRun(
        agent,
        seat.registry,
        scheduleCid,
        { isin, kind, currency, paymentDate: terms.paymentDate, entries: fresh.schedule.entries },
        approver,
      );
      setRunId(id);
      setPressed({ kind: "idle" });
    } catch (e) {
      const reason = e instanceof LedgerError ? extractReason(e.body) : String(e);
      setPressed({ kind: "failed", what: "coupon", reason: `could not ${step}: ${reason}` });
    } finally {
      refresh();
    }
  }, [agent, issuer, refresh, seat.isin, seat.registry, state]);

  return { state, error, pressed, lastAt, refresh, onSettle, onWithdraw, onCancelRun, onPrepare, onSetUpCoupon, runId, ledgers: { agent, registry } };
}

function extractReason(body: string): string {
  try {
    const j = JSON.parse(body);
    return j.cause ?? j.message ?? body;
  } catch {
    return body;
  }
}
