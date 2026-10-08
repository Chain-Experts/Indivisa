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
  /** File an announcement, signed by the bond's own issuer. The caller passes
   *  the issuer, the bond and its currency, because the ISSUER desk reads all
   *  three from the issuers' own nodes; nothing here comes from the agent's
   *  view of the register, and since 9 October the three bonds have three
   *  different issuers, so there is no single party this could assume. */
  onAnnounce: (issuerParty: Party, isin: string, currency: string, terms: CouponTerms) => Promise<boolean>;
  /** The agent's three steps on an announcement the issuer has already made. */
  onEntitle: (actionCid: string, recordDate: string, paymentDate: string, policy: string, approver: Party | null) => Promise<void>;
  /** The last step on a coupon whose schedule exists but whose run does not. */
  onCreateRun: (approver: Party | null) => Promise<void>;
  /** The run the page is reading. Starts as the seat's and follows the page
   *  when it sets up a later coupon, which has a run id of its own. */
  runId: string;
  /** The two connections, so the vote can reuse them rather than open its own. */
  ledgers: { agent: Ledger; registry: Ledger };
}

/**
 * @param isin          the bond on screen, which the operator picks
 * @param selectedRunId its latest coupon, and the run the panes read
 */
export function useAgent(config: Config, isin: string, selectedRunId: string): AgentHandle {
  const { seat } = config;
  const agent = useMemo(
    () => new Ledger(config.baseOf(config.participantOf(seat.payingAgent)), seat.payingAgent),
    [config, seat.payingAgent],
  );
  const registry = useMemo(
    () => new Ledger(config.baseOf(config.participantOf(seat.registry)), seat.registry),
    [config, seat.registry],
  );

  // The run the panes read. It follows the operator's choice of bond, and
  // also follows the page itself when it sets up a later coupon, which has a
  // run id of its own.
  const [runId, setRunId] = useState(selectedRunId);
  const [state, setState] = useState<AgentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [pressed, setPressed] = useState<Pressed>({ kind: "idle" });
  // Picking a different coupon clears what was last pressed, and that is not
  // tidiness: `pressed` carries the OUTCOME of a press, and the rejection
  // strip renders on `pressed.kind === "rejected"` without looking at which
  // run was refused. So a coupon refused for a missing holder put a red
  // SETTLEMENT REJECTED banner over every other unsettled coupon the operator
  // then opened - found by Avraham on 8 October. `state.rejections` was always
  // filtered by run id correctly; this was the pressed state outliving its run.
  //
  // Only fires when the OPERATOR picks a coupon. The actions below move
  // `runId` themselves after creating a run, and set their own `pressed`.
  useEffect(() => {
    setRunId(selectedRunId);
    setPressed({ kind: "idle" });
  }, [selectedRunId]);

  const failures = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setState(await agentState(agent, runId, isin));
      setError(null);
      setLastAt(Date.now());
      failures.current = 0;
    } catch (e) {
      // One failed poll is noise (the proxy, a busy node); two in a row is worth showing.
      failures.current += 1;
      if (failures.current >= 2) setError(String(e));
    }
  }, [agent, runId, isin]);

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
      const reason = reasonOf(e);
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
      const reason = reasonOf(e);
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
      const reason = reasonOf(e);
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
      const reason = reasonOf(e);
      // Not "rejected": that strip says SETTLEMENT REJECTED, and a failed
      // preparation is not a refused settlement. The same distinction the
      // cancel path had to learn on 2 October.
      setPressed({ kind: "failed", what: "prepare", reason });
    } finally {
      refresh();
    }
  }, [agent, registry, refresh, seat.rulesCid, state]);

  // The issuer's one action, and the only thing the issuer desk does.
  //
  // It is a separate call on a separate screen because it is a separate
  // company: `CorporateAction` is signed by the issuer and only observed by
  // the agent. Keeping it on the agent's console made one screen act for two
  // firms, which is not what a deployment looks like and is not what we claim.
  // The bond and its currency are arguments now, and they come from the
  // issuer's own read of its own `Instrument` contracts. Two things went with
  // that change. The announcement no longer lands on whatever bond another
  // desk happened to have selected, which had no undo. And the currency no
  // longer comes from `agentState`, so announcing in the first seconds after
  // opening the desk stopped failing with "the instrument has not been read
  // yet" - a race against a poll this screen does not own.
  const onAnnounce = useCallback(async (issuerParty: Party, bondIsin: string, currency: string, terms: CouponTerms) => {
    // Built per call rather than memoised, because which issuer signs depends
    // on which bond was picked and each bond has its own. A Ledger is a base
    // URL and a party, so this costs nothing.
    const issuer = new Ledger(config.baseOf(config.participantOf(issuerParty)), issuerParty);
    setPressed({ kind: "busy" });
    try {
      await announce(issuer, agent.party, bondIsin, "Coupon", currency, terms);
      setPressed({ kind: "idle" });
      return true;
    } catch (e) {
      setPressed({ kind: "failed", what: "coupon", reason: `could not announce the event: ${reasonOf(e)}` });
      return false;
    } finally {
      refresh();
    }
  }, [agent, config, refresh]);

  // A schedule that has no run yet.
  //
  // Entitling an announcement consumes it, so a coupon stopped between the
  // schedule and the run has nothing left to "work": the announcement is gone
  // and the entitlements are the record of it. This is the one step left, and
  // it is how the governed quickstart starts, because its seat entitles and
  // then stops so that the run can be created with an approver named.
  const onCreateRun = useCallback(async (approver: Party | null) => {
    const currency = state?.instrument?.currency;
    const schedule = state?.schedule;
    if (!currency || !schedule) {
      setPressed({ kind: "failed", what: "coupon", reason: "there is no schedule on this bond to create a run from" });
      return;
    }
    setPressed({ kind: "busy" });
    try {
      const id = await createRun(
        agent,
        seat.registry,
        schedule.cid,
        { isin, kind: schedule.kind, currency, paymentDate: schedule.paymentDate, entries: schedule.entries },
        approver,
      );
      setRunId(id);
      setPressed({ kind: "idle" });
    } catch (e) {
      setPressed({ kind: "failed", what: "coupon", reason: `could not create the run: ${reasonOf(e)}` });
    } finally {
      refresh();
    }
  }, [agent, isin, refresh, seat.registry, state]);

  // The agent's three steps, on an announcement the issuer has already made.
  //
  // Freeze the register on the record date, derive the schedule from the
  // announcement and that snapshot, create the run. Each is idempotent, so
  // pressing again after a failure finishes the job. `approver` set makes the
  // run governed, and that is the agent's decision, not the issuer's.
  const onEntitle = useCallback(
    async (actionCid: string, recordDate: string, paymentDate: string, policy: string, approver: Party | null) => {
      const currency = state?.instrument?.currency;
      if (!currency) {
        setPressed({ kind: "failed", what: "coupon", reason: "the instrument has not been read yet; wait for the page to load" });
        return;
      }
      setPressed({ kind: "busy" });
      // Which step failed matters more than the message: an operator can act
      // on "the register could not be frozen" and cannot act on a trace.
      let step = "freeze the register";
      try {
        const snapshotCid = await freezeRegister(agent, isin, recordDate);
        step = "derive the schedule";
        const scheduleCid = await entitle(agent, actionCid, snapshotCid, isin, paymentDate, policy);
        step = "create the run";
        const fresh = await agentState(agent, runIdFor(isin, "Coupon", paymentDate), isin);
        if (!fresh.schedule) throw new Error("the schedule was derived but the page could not read it back");
        const id = await createRun(
          agent,
          seat.registry,
          scheduleCid,
          { isin, kind: "Coupon", currency, paymentDate, entries: fresh.schedule.entries },
          approver,
        );
        setRunId(id);
        setPressed({ kind: "idle" });
      } catch (e) {
        setPressed({ kind: "failed", what: "coupon", reason: `could not ${step}: ${reasonOf(e)}` });
      } finally {
        refresh();
      }
    },
    [agent, isin, refresh, seat.registry, state],
  );

  return { state, error, pressed, lastAt, refresh, onSettle, onWithdraw, onCancelRun, onPrepare, onAnnounce, onEntitle, onCreateRun, runId, ledgers: { agent, registry } };
}

/** What to show an operator. A ledger refusal carries its cause in the body;
 *  anything else is one of our own errors, and `String(err)` would prefix it
 *  with "Error: ", which reads as a crash rather than as an explanation. */
function reasonOf(e: unknown): string {
  if (e instanceof LedgerError) return extractReason(e.body);
  return e instanceof Error ? e.message : String(e);
}

function extractReason(body: string): string {
  try {
    const j = JSON.parse(body);
    return j.cause ?? j.message ?? body;
  } catch {
    return body;
  }
}
