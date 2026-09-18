import { useCallback, useEffect, useRef, useState } from "react";
import { Ledger, LedgerError } from "../ledger/client";
import { agentState, factoryDisclosure, recordRejection, settle, type AgentState } from "../ledger/queries";
import { displayName, shortId, type Config } from "../config";
import { Money } from "../components/Money";
import { LegTable } from "../components/LegTable";
import { StatusPill } from "../components/StatusPill";

const POLL_MS = 2000;

type Pressed =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "settled"; updateId: string; ms: number }
  | { kind: "rejected"; reason: string };

// The executor's view: the whole distribution, and the one button.
export function PayingAgent({ config }: { config: Config }) {
  const { seat } = config;
  const agent = new Ledger(config.baseOf(config.participantOf(seat.payingAgent)), seat.payingAgent);
  const registry = new Ledger(config.baseOf(config.participantOf(seat.registry)), seat.registry);

  const [state, setState] = useState<AgentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const failures = useRef(0);
  const [pressed, setPressed] = useState<Pressed>({ kind: "idle" });

  const refresh = useCallback(async () => {
    try {
      setState(await agentState(agent, seat.runId, seat.isin));
      setError(null);
      failures.current = 0;
    } catch (e) {
      // One failed poll is noise (the dev proxy, a busy node); two in a row is worth showing.
      failures.current += 1;
      if (failures.current >= 2) setError(String(e));
    }
  }, [seat.runId, seat.isin]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const onSettle = async () => {
    if (!state?.run) return;
    setPressed({ kind: "busy" });
    try {
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
  };

  const currency = state?.instrument?.currency ?? "USD";
  const legs = state?.run?.legs ?? state?.schedule?.entries.length ?? seat.legs;
  const expectedAllocations = legs + 1;
  const haveAllocations = state?.allocations.length ?? 0;
  const settled = state?.receipt != null;
  const canPress = !!state?.run && !settled && pressed.kind !== "busy";
  const latestRejection = state?.rejections[0] ?? null;

  return (
    <section className="pane pane-agent">
      <header className="pane-head">
        <div>
          <div className="eyebrow">Paying agent · sees every leg</div>
          <h2>{displayName(seat.payingAgent, seat.tag)}</h2>
          <div className="sub">participant <code>{config.participantOf(seat.payingAgent)}</code> · party <code>{shortId(seat.payingAgent.split("::")[1] ?? "", 12)}</code></div>
        </div>
        {settled ? <StatusPill tone="ok">settled</StatusPill>
          : latestRejection && pressed.kind !== "settled" ? <StatusPill tone="bad">rejected</StatusPill>
          : state?.run ? <StatusPill tone="ready">prepared</StatusPill>
          : <StatusPill tone="neutral">not prepared</StatusPill>}
      </header>

      {error ? <div className="error">{error}</div> : null}

      {state?.instrument ? (
        <dl className="facts">
          <dt>Instrument</dt><dd>{state.instrument.name} <span className="muted">{state.instrument.isin}</span></dd>
          <dt>Event</dt><dd>Coupon · record date {state.schedule?.recordDate} · payment date {state.schedule?.paymentDate}</dd>
          <dt>Per unit</dt><dd>{state.schedule ? <Money amount={state.schedule.amountPerUnit} currency={currency} /> : "—"} <span className="muted">· rounding {state.schedule?.policy}</span></dd>
          <dt>Holders</dt><dd>{legs.toLocaleString("en-GB")}</dd>
          <dt>Total due</dt><dd className="big">{state.schedule ? <Money amount={state.schedule.total} currency={currency} /> : "—"}</dd>
          <dt>Allocations</dt>
          <dd>
            {settled ? <span>{expectedAllocations} consumed by the settlement</span> : <span>{haveAllocations} of {expectedAllocations}</span>}
            <span className="muted"> · 1 send + {legs} receipts</span>
            {state.run && !settled && haveAllocations < expectedAllocations ? <span className="warn"> · {expectedAllocations - haveAllocations} missing</span> : null}
          </dd>
        </dl>
      ) : (
        <p className="muted">Reading the ledger…</p>
      )}

      <div className="action">
        <button className="settle" disabled={!canPress} onClick={onSettle}>
          {pressed.kind === "busy" ? "Settling…" : settled ? "Settled" : `Settle ${legs.toLocaleString("en-GB")} legs in one transaction`}
        </button>
        <div className="action-note">
          {settled ? "This run has settled. Every holder was paid in the same transaction." : !state?.run ? "Prepare the run first: demo.ps1 prepare -Tag " + seat.tag : "All or nothing. If any leg cannot settle, nothing moves."}
        </div>
      </div>

      {settled && state?.receipt ? (
        <div className="outcome ok">
          <div className="outcome-title">SETTLED · {state.receipt.legsSettled.toLocaleString("en-GB")} of {legs.toLocaleString("en-GB")} legs · <Money amount={state.receipt.total} currency={currency} /></div>
          <div className="outcome-line">update id <code>{state.receipt.updateId ?? "…"}</code></div>
          <div className="outcome-line muted">
            {state.receipt.effectiveAt ? `effective ${state.receipt.effectiveAt}` : ""}
            {pressed.kind === "settled" ? ` · submitted to committed in ${pressed.ms.toLocaleString("en-GB")} ms` : ""}
          </div>
        </div>
      ) : pressed.kind === "rejected" || (latestRejection && !settled) ? (
        <div className="outcome bad">
          <div className="outcome-title">SETTLEMENT REJECTED · {legs.toLocaleString("en-GB")} payments requested · 0 executed</div>
          <div className="outcome-line">NO PARTIAL SETTLEMENT</div>
          <div className="outcome-reason">{pressed.kind === "rejected" ? pressed.reason : latestRejection?.reason}</div>
          {latestRejection ? <div className="outcome-line muted">recorded on-ledger at {latestRejection.attemptedAt}</div> : null}
        </div>
      ) : null}

      {state?.schedule ? (
        <>
          <h3>The schedule <span className="muted">· every holder, as the executor sees it</span></h3>
          <LegTable
            currency={currency}
            rows={state.schedule.entries.map((e) => ({ who: displayName(e.holder, seat.tag), units: Number(e.quantity), amount: Number(e.amount) }))}
          />
        </>
      ) : null}
    </section>
  );
}

function extractReason(body: string): string {
  try {
    const j = JSON.parse(body);
    return j.cause ?? j.message ?? body;
  } catch {
    return body;
  }
}
