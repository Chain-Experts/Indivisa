import { useEffect, useRef, useState } from "react";
import { Money } from "../components/Money";
import { StatusPill } from "../components/StatusPill";
import { displayName, type Config } from "../config";
import type { AgentHandle } from "../state/useAgent";
import type { VoteHandle } from "../state/useVote";
import type { CouponTerms } from "../ledger/queries";
import type { Party } from "../ledger/client";

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

/**
 * Setting a coupon up, where it used to be a terminal.
 *
 * Four ledger steps in the order the model requires: the issuer announces, the
 * register is frozen on the record date, the schedule is derived from those two
 * on the ledger, and the run is created from the schedule. Each is idempotent,
 * so the form doubles as the way to finish a set-up that stopped half way.
 *
 * It opens by itself when there is no run, because that is the state an
 * operator is stuck in and the panel is the way out. Otherwise it is a link,
 * because the page is about the run, not about making another one.
 */
function CouponSetup({
  busy,
  open,
  schedule,
  approver,
  onSetUp,
}: {
  busy: boolean;
  open: boolean;
  schedule: { amountPerUnit: number; recordDate: string; paymentDate: string; policy: string } | null;
  approver: Party | null;
  onSetUp: (terms: CouponTerms, approver: Party | null) => Promise<void>;
}) {
  // Null until the operator touches it, so until then the panel follows the
  // page: open while there is no run, because that is the state they are stuck
  // in, and a link once there is one. After a click their choice sticks.
  const [showing, setShowing] = useState<boolean | null>(null);
  const expanded = showing ?? open;
  // Prefilled from the coupon on screen, so the common case is "the same terms,
  // now make the run" and the operator changes only what differs.
  const [rate, setRate] = useState(schedule ? String(schedule.amountPerUnit) : "");
  const [recordDate, setRecordDate] = useState(schedule?.recordDate ?? "");
  const [paymentDate, setPaymentDate] = useState(schedule?.paymentDate ?? "");
  const [policy, setPolicy] = useState(schedule?.policy ?? "LargestRemainder");
  const [governed, setGoverned] = useState(!!approver);
  // Seed the fields the first time a schedule arrives, and only then.
  //
  // The page polls every two seconds, so the schedule is not there on the
  // first render. Keying the whole component on it fixed the empty form and
  // broke something worse: every poll remounted it, so the panel an operator
  // had just opened closed again within two seconds, taking anything they had
  // typed with it. Seed once, never remount, and the operator keeps both.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !schedule) return;
    seeded.current = true;
    setRate(String(schedule.amountPerUnit));
    setRecordDate(schedule.recordDate);
    setPaymentDate(schedule.paymentDate);
    setPolicy(schedule.policy);
  }, [schedule]);

  if (!expanded) {
    return (
      <button className="linklike" disabled={busy} onClick={() => setShowing(true)}>
        Set up another coupon
      </button>
    );
  }

  const ready = rate.trim() !== "" && recordDate !== "" && paymentDate !== "";
  return (
    <div className="action-second coupon-setup">
      <div className="coupon-fields">
        <label>
          Per unit
          <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" id="coupon-rate" />
        </label>
        <label>
          Record date
          <input value={recordDate} onChange={(e) => setRecordDate(e.target.value)} type="date" id="coupon-record" />
        </label>
        <label>
          Payment date
          <input value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} type="date" id="coupon-payment" />
        </label>
        <label>
          Rounding
          <select value={policy} onChange={(e) => setPolicy(e.target.value)} id="coupon-policy">
            <option value="LargestRemainder">Largest remainder</option>
            <option value="RoundHalfUpResidualToIssuer">Half up, residual to the issuer</option>
          </select>
        </label>
      </div>
      {approver ? (
        <label className="coupon-governed">
          <input type="checkbox" checked={governed} onChange={(e) => setGoverned(e.target.checked)} id="coupon-governed" />
          Needs the approvers. The run names the decentralised party as a second executor, so the agent cannot
          settle it alone.
        </label>
      ) : null}
      <div className="coupon-actions">
        <button
          className="settle fix"
          disabled={busy || !ready}
          onClick={() =>
            void onSetUp(
              { amountPerUnit: rate.trim(), recordDate, paymentDate, policy: policy as CouponTerms["policy"] },
              governed ? approver : null,
            )
          }
        >
          {busy ? "Setting up…" : "Announce, freeze, derive, create the run"}
        </button>
        <button className="linklike" disabled={busy} onClick={() => setShowing(false)}>
          Not now
        </button>
      </div>
      <span className="action-note">
        Four ledger steps, in order. The announcement is submitted <strong>as the issuer</strong>, which this
        console can do only because it is a demo harness holding every party's credential; in a deployment the
        announcement arrives from the issuer and the agent acts on it. The register is frozen as the registrar,
        which here is the paying agent. The schedule is then derived on the ledger from those two, so it is
        checkable rather than uploaded.
      </span>
    </div>
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
  // A run whose allocations are not all on the ledger cannot settle, and on a
  // GOVERNED run the agent should not ask anyone to approve one that cannot.
  // The approvers are a release control - "should this payment go out" - not a
  // data check. Filing a request with a holder missing spends their attention
  // on something that would fail at execute, after they had approved it.
  //
  // Deliberately NOT applied to an ungoverned run. There the button is a real
  // settlement attempt, the ledger refuses it, and that refusal is the
  // atomicity guarantee being demonstrated rather than an operator mistake.
  const incomplete = haveAllocations < expectedAllocations;
  // Once the engine says the threshold is met, the primary button has nothing
  // left to say. It would read "Waiting for the approvers", disabled, directly
  // above a live settle button - so an operator who then settles is left
  // wondering whether they released a payment the approvers had not agreed to,
  // and reads the page as broken. The execute button below replaces it.
  const approved = !settled && !!voting?.vote?.canExecute;
  const canPress =
    !!state?.run && !settled && pressed.kind !== "busy" && !(governed && asked) && !(governed && incomplete);
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
  // A cancelled run is one whose SEND allocation is gone while every receipt
  // is still there, because cancelling takes only the send. A run that merely
  // never finished being prepared also has no send, and announcing that one as
  // cancelled is a lie the operator cannot check: seen 7 October, when the
  // send failed and five receipts had landed.
  const cancelled = !!state?.run && !settled && !asked && !sendLocked && haveAllocations >= legs;
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
        {config.readOnly || approved ? null : (
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
        {pressed.kind === "failed" && pressed.what === "cancel" ? (
          <span className="cancel-failed">
            <b>The run was not cancelled.</b> {pressed.reason}
          </span>
        ) : null}
        <div className="action-note">
          {cancelled ? (
            <span>
              <b>No send allocation.</b> Either this run was cancelled and its locked cash released, or it was
              never finished: from the active contracts alone the two look the same. Either way the batch cannot
              settle until the agent allocates again, and the holders authorisations are untouched, so preparing
              it again does not ask them twice.
            </span>
          ) : config.readOnly
            ? settled
              ? "This run has settled. Every holder was paid in the same transaction; this page reads the ledger and cannot change it."
              : "This page reads the ledger and cannot change it. The settlement is run by the paying agent from its own client."
            : settled
              ? "This run has settled. Every holder was paid in the same transaction."
              : !state?.run
                ? "No run yet. Set one up below: the issuer announces, the register is frozen on the record date, the schedule is derived from those two on the ledger, and the run follows from the schedule."
                : governed
                  ? asked
                    ? "Asked. All or nothing, and not alone: this settles only when the approvers have confirmed to their threshold, each on their own node."
                    : incomplete
                      ? "This run is not ready to ask about: one holder's allocation is not on the ledger yet, so the settlement would fail after the approvers had agreed to it. Their job is to decide whether the payment goes out, not to check the data."
                      : "All or nothing, and not alone: this run names an approver, so the agent cannot settle it. The button signs a request instead. The cash these allocations lock is committed to the approvers too, so releasing it is their decision as much as the agent's."
                  : "All or nothing. If any leg cannot settle, nothing moves."}
          {!settled && !cancelled && missing.length > 0 ? (
            <span className="warn">
              {" "}
              Waiting for {missing.length <= 3 ? missing.join(", ") : `${missing.slice(0, 2).join(", ")} and ${missing.length - 2} more`}.
            </span>
          ) : null}
        </div>
        {/* The fix, where the problem is stated. This was a terminal until
            7 October: demo.ps1 prepare, or docker compose run --rm prepare.
            It creates only what is absent, so pressing it twice is safe and
            it is deliberately not disabled after a press. */}
        {/* Gated on the allocation count, not on holders waiting: a run can be
            short of its SEND allocation alone, and then no holder is waiting
            and the fix still has work to do. Seen 7 October. */}
        {!settled && !config.readOnly && state?.run && incomplete ? (
          <div className="action-second">
            <button className="settle fix" disabled={pressed.kind === "busy"} onClick={agent.onPrepare}>
              {pressed.kind === "busy"
                ? "Creating…"
                : `Create the ${expectedAllocations - haveAllocations} missing allocation${expectedAllocations - haveAllocations === 1 ? "" : "s"}`}
            </button>
            <span className="action-note">
              The paying agent creates them alone, under the standing agreement each holder signed at
              onboarding. No holder is asked for anything.
            </span>
          </div>
        ) : null}
        {pressed.kind === "failed" && pressed.what === "prepare" ? (
          <div className="action-note warn">The allocations were not created. {pressed.reason}</div>
        ) : null}
        {!settled && !config.readOnly ? (
          <CouponSetup
            busy={pressed.kind === "busy"}
            open={!state?.run}
            schedule={state?.schedule ?? null}
            approver={config.decmanParty}
            onSetUp={agent.onSetUpCoupon}
          />
        ) : null}
        {pressed.kind === "failed" && pressed.what === "coupon" ? (
          <div className="action-note warn">{pressed.reason}</div>
        ) : null}
        {state?.run?.approver ? (
          <div className="action-note approver">
            Approver <strong>{displayName(state.run.approver, seat.tag)}</strong> · a decentralised party;{" "}
            {approved
              ? "its members have confirmed to their threshold."
              : "its members must confirm before the settle can execute."}
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
