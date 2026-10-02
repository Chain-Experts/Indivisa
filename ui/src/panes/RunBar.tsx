import { useState } from "react";
import { Money } from "../components/Money";
import { StatusPill } from "../components/StatusPill";
import { displayName, type Config } from "../config";
import type { AgentHandle } from "../state/useAgent";
import type { VoteHandle } from "../state/useVote";

export interface RunSummary {
  currency: string;
  legs: number;
  expectedAllocations: number;
  haveAllocations: number;
  /** Holders whose own receipt allocation is on the ledger. */
  authorised: Set<string>;
  missing: string[];
  settled: boolean;
  /** Units on the schedule, and what they come to before rounding. */
  units: number;
  exactTotal: number;
}

/**
 * The working header: what is being paid, to how many, for how much, how
 * ready it is, and the one command that moves it. Everything here is read
 * from the paying agent's own participant.
 */
/**
 * Cancel a prepared run, before anybody has been asked for anything.
 *
 * `prepare` locks the agent cash in a send allocation. A coupon found to be
 * wrong at this stage therefore has real money tied up behind it, and the only
 * alternative to a control here is a developer with a terminal.
 *
 * Two presses, like withdrawing a request: releasing locked funds is not a
 * thing to do on one click, and naming what happens is the cheapest guard
 * against the wrong one.
 */
function CancelRun({ busy, onCancel }: { busy: boolean; onCancel: () => Promise<void> }) {
  const [arming, setArming] = useState(false);
  if (!arming) {
    return (
      <button className="linklike cancel-run" disabled={busy} onClick={() => setArming(true)}>
        Cancel this run
      </button>
    );
  }
  return (
    <span className="cancel-confirm">
      <span>
        Cancel the run and release the locked cash? Nothing has been asked of anyone yet, and the holders
        authorisations are kept.
      </span>
      <span className="cancel-actions">
        <button className="danger" disabled={busy} onClick={() => { setArming(false); void onCancel(); }}>
          {busy ? "Cancelling…" : "Cancel the run"}
        </button>
        <button className="linklike" disabled={busy} onClick={() => setArming(false)}>
          Keep it
        </button>
      </span>
    </span>
  );
}

export function RunBar({
  config,
  agent,
  run,
  voting,
}: {
  config: Config;
  agent: AgentHandle;
  run: RunSummary;
  /** Absent on a network with no Decentralization Manager configured. */
  voting?: VoteHandle;
}) {
  const { seat } = config;
  const { state, pressed } = agent;
  const { currency, legs, expectedAllocations, haveAllocations, missing, settled, units, exactTotal } = run;
  // A run with an approver is not the agent's to settle, so the button asks
  // instead; and once it has asked there is nothing more for the agent to do
  // until the approvers have voted.
  const governed = !!state?.run?.approver;
  const asked = !!state?.proposal || pressed.kind === "proposed";
  const canPress = !!state?.run && !settled && pressed.kind !== "busy" && !(governed && asked);
  // The send allocation is the one that locks the agent cash; receiving locks
  // nothing. Its presence is what makes a prepared run cancellable, and its
  // absence is what a cancelled run looks like.
  const sendLocked = !!state?.allocations.some((a) => a.isSend);
  // Deliberately not gated on `busy`: the control stays on screen while the
  // request is in flight so it can say "Cancelling…", instead of vanishing at
  // the moment the operator is waiting to see what happened.
  // Only where the agent is the sole executor. A committed allocation is
  // ended by its EXECUTORS, and on a governed run those are the agent and the
  // approver - so the agent cannot release the cash alone. That is the
  // commitment working, not a missing feature: it is what makes the approval
  // worth something. Offering a button that the ledger would refuse would be
  // worse than offering none.
  const cancellable = !!state?.run && !settled && !asked && sendLocked && !governed;
  const cancelled = !!state?.run && !settled && !asked && !sendLocked && (state?.allocations.length ?? 0) > 0;
  const ready = Math.min(haveAllocations, expectedAllocations);
  const pct = expectedAllocations > 0 ? Math.round((ready / expectedAllocations) * 100) : 0;

  return (
    <section className="runbar">
      <div className="kpis">
        <Kpi label="Instrument" wide>
          <span className="kpi-strong">{state?.instrument?.name ?? "—"}</span>
          <span className="kpi-sub">
            {state?.instrument?.isin ?? ""} · coupon · record {state?.schedule?.recordDate ?? "—"} · pays{" "}
            {state?.schedule?.paymentDate ?? "—"}
          </span>
        </Kpi>
        <Kpi label="Holders">
          <span className="kpi-num">{legs.toLocaleString("en-GB")}</span>
          <span className="kpi-sub">on {new Set(seat.holders.map((h) => config.participantOf(h))).size} participants</span>
        </Kpi>
        <Kpi label="Per unit">
          {/* At full precision. The rate carries more decimals than the cash does. */}
          <span className="kpi-num">{state?.schedule ? <Money amount={state.schedule.amountPerUnit} currency={currency} maxDecimals={10} /> : "—"}</span>
          <span className="kpi-sub">
            × {units.toLocaleString("en-GB")} units = {exactTotal.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 10 })}
          </span>
        </Kpi>
        <Kpi label="Total due">
          <span className="kpi-num accent">{state?.schedule ? <Money amount={state.schedule.total} currency={currency} /> : "—"}</span>
          <span className="kpi-sub">to the cent · {state?.schedule?.policy ?? "—"}</span>
        </Kpi>
        <Kpi label="Allocations">
          <span className="kpi-num">
            {settled ? expectedAllocations : ready}
            <span className="kpi-of"> / {expectedAllocations}</span>
          </span>
          <div className="meter" role="img" aria-label={`${ready} of ${expectedAllocations} allocations on the ledger`}>
            <div className={`meter-fill${settled ? " done" : pct === 100 ? " full" : ""}`} style={{ width: `${settled ? 100 : pct}%` }} />
          </div>
          <span className="kpi-sub">
            1 send + {legs} receipts{settled ? ", consumed by the settlement" : null}
          </span>
        </Kpi>
        <Kpi label="Run">
          {settled ? <StatusPill tone="ok">settled</StatusPill>
            : asked ? <StatusPill tone="ready">awaiting approval</StatusPill>
            : state?.rejections.length && pressed.kind !== "settled" ? <StatusPill tone="bad">rejected</StatusPill>
            : state?.run ? <StatusPill tone="ready">prepared</StatusPill>
            : <StatusPill tone="neutral">not prepared</StatusPill>}
          <span className="kpi-sub">
            {displayName(seat.payingAgent, seat.tag)} · <code>{config.participantOf(seat.payingAgent)}</code>
          </span>
        </Kpi>
      </div>

      <div className="action">
        {config.readOnly ? null : (
          <button className="settle" disabled={!canPress} onClick={agent.onSettle}>
            {pressed.kind === "busy"
              ? governed
                ? "Asking…"
                : "Settling…"
              : settled
                ? "Settled"
                : governed
                  ? asked
                    ? "Waiting for the approvers"
                    : `Ask the approvers to settle ${legs.toLocaleString("en-GB")} legs`
                  : `Settle ${legs.toLocaleString("en-GB")} legs in one transaction`}
          </button>
        )}
        {cancellable && !config.readOnly ? <CancelRun busy={pressed.kind === "busy"} onCancel={agent.onCancelRun} /> : null}
        {pressed.kind === "failed" ? (
          <span className="cancel-failed">
            <b>The run was not cancelled.</b> {pressed.reason}
          </span>
        ) : null}
        <div className="action-note">
          {cancelled ? (
            <span>
              <b>This run was cancelled.</b> The agent locked cash has been released and the batch can no longer
              settle. The holders authorisations are untouched, so preparing the run again does not ask them twice:{" "}
              <code>demo.ps1 prepare -Tag {seat.tag}</code>
            </span>
          ) : config.readOnly
            ? settled
              ? "This run has settled. Every holder was paid in the same transaction; this page reads the ledger and cannot change it."
              : "This page reads the ledger and cannot change it. The settlement is run by the paying agent from its own client."
            : settled
              ? "This run has settled. Every holder was paid in the same transaction."
              : !state?.run
                ? `Prepare the run first: demo.ps1 prepare -Tag ${seat.tag}`
                : governed
                  ? asked
                    ? "Asked. All or nothing, and not alone: this settles only when the approvers have confirmed to their threshold, each on their own node."
                    : "All or nothing, and not alone: this run names an approver, so the agent cannot settle it. The button signs a request instead. The cash these allocations lock is committed to the approvers too, so releasing it is their decision as much as the agent's."
                  : "All or nothing. If any leg cannot settle, nothing moves."}
          {!settled && !cancelled && missing.length > 0 ? (
            <span className="warn">
              {" "}
              Waiting for {missing.length <= 3 ? missing.join(", ") : `${missing.slice(0, 2).join(", ")} and ${missing.length - 2} more`}.
            </span>
          ) : null}
        </div>
        {state?.run?.approver ? (
          <div className="action-note approver">
            Approver <strong>{displayName(state.run.approver, seat.tag)}</strong> · a decentralised party; its members must
            confirm before the settle can execute.
            {voting?.vote ? (
              <>
                {" "}
                <strong>
                  {voting.vote.confirmations} of {voting.vote.threshold} confirmed.
                </strong>
              </>
            ) : null}
          </div>
        ) : null}
        {/* The execute is offered only when the engine itself says the
            threshold is met. Asking the page to decide that from a count
            would be a second opinion on somebody else's rules. */}
        {!settled && voting?.vote?.canExecute ? (
          <div className="action-second">
            <button className="settle go" disabled={voting.executing.kind === "busy"} onClick={voting.onExecute}>
              {voting.executing.kind === "busy" ? "Settling…" : `Settle ${legs.toLocaleString("en-GB")} legs, now approved`}
            </button>
            <span className="action-note">
              The approvers have agreed. This exercises the settlement with their authority and the agent's together.
            </span>
          </div>
        ) : null}
        {voting?.executing.kind === "failed" ? (
          <div className="action-note warn">{voting.executing.reason}</div>
        ) : null}
      </div>
    </section>
  );
}

function Kpi({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`kpi${wide ? " wide" : ""}`}>
      <div className="kpi-label">{label}</div>
      {children}
    </div>
  );
}
