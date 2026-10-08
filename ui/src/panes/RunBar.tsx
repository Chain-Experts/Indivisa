import { useEffect, useState } from "react";
import { Money } from "../components/Money";
import { StatusPill } from "../components/StatusPill";
import { displayName, type Config } from "../config";
import type { AgentHandle } from "../state/useAgent";
import type { VoteHandle } from "../state/useVote";
import type { Announcement } from "../ledger/queries";
import type { Party } from "../ledger/client";
import { TURN, type LegStatus } from "../components/LegTable";
import { committee, type Committee } from "../ledger/decman";

export interface RunSummary {
  /** The bond on screen, and its latest coupon. Both follow the operator's
   *  choice rather than the seat file, so every pane reads the same one. */
  isin: string;
  runId: string;
  /** Announcements on this bond the agent has not entitled yet. */
  pending: Announcement[];
  currency: string;
  legs: number;
  expectedAllocations: number;
  haveAllocations: number;
  /** Holders whose own side of the payment is authorised on the ledger. */
  authorised: Set<string>;
  /** Holders who have given the agent no settlement instructions. Nothing the
   *  agent presses can fix this: the holder has to provide them. */
  noInstructions: string[];
  /** How many legs sit in each state. The strip beside the button reads these
   *  rather than counting the name lists, so it cannot drift from the cards. */
  counts: Record<LegStatus, number>;
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
 * Who may release this payment, chosen before the run exists.
 *
 * This was a checkbox, and a checkbox was wrong for it twice over. It named
 * nobody - "needs the approvers", with no answer to which approvers, how many
 * there are or how many have to agree - and it made the most consequential
 * choice on the panel look like a formatting preference. It is not: it decides
 * whether one company can move this money by itself.
 *
 * So: two options, both spelled out, with the committee read from the live
 * governance rules rather than described in prose. The threshold shown is the
 * real one and the members are the real member parties.
 *
 * The honest caveat is on the page too. Counting members is not counting
 * companies: on a stack where the approver nodes run beside each other, three
 * members are three processes on one machine. The claim this control supports
 * is that no single MEMBER can release the payment, which is true everywhere.
 * Whether those members are independent operators is a property of the
 * deployment, and the DevNet run is where that was shown.
 */
function Release({
  approver,
  governed,
  onChange,
  busy,
}: {
  approver: Party;
  governed: boolean;
  onChange: (governed: boolean) => void;
  busy: boolean;
}) {
  const [seats, setSeats] = useState<Committee | null>(null);
  // Read once per party. A committee changes only through a self-governance
  // action, which is rare and never while this panel is open; polling it would
  // be a request every two seconds for a number that does not move.
  useEffect(() => {
    let live = true;
    committee(approver)
      .then((c) => { if (live) setSeats(c); })
      .catch(() => { if (live) setSeats(null); });
    return () => { live = false; };
  }, [approver]);

  // Party ids are a hint and a fingerprint. The hint is the readable half and
  // the fingerprint is 68 characters of hex that would bury it. The hint is
  // itself a UUID where DecMan allocated the member party rather than being
  // given a name, so it is truncated: three full UUIDs name nobody, which is
  // the fault this control was built to fix.
  const hint = (p: string) => {
    const h = p.split("::")[0];
    return h.length > 24 ? h.slice(0, 12) + "…" : h;
  };

  return (
    <fieldset className="release" disabled={busy}>
      <legend>How should this run be released?</legend>
      <label className={governed ? "release-opt" : "release-opt on"}>
        <input type="radio" name="release" id="release-alone" checked={!governed} onChange={() => onChange(false)} />
        <span className="release-main">The paying agent alone</span>
        <span className="release-sub">
          It settles the moment the agent presses the button. One company decides, which is how a paying agent
          works today and is the main product.
        </span>
      </label>
      <label className={governed ? "release-opt on" : "release-opt"}>
        <input type="radio" name="release" id="release-approvers" checked={governed} onChange={() => onChange(true)} />
        <span className="release-main">
          The approvers must agree
          {seats ? <span className="release-th">{seats.threshold} of {seats.members.length}</span> : null}
        </span>
        <span className="release-sub">
          The run names <strong>{hint(approver)}</strong> as a second executor, so the agent cannot settle it
          alone. The button files a request instead, and the settlement executes only once{" "}
          {seats ? <strong>{seats.threshold}</strong> : "enough"} of its members have confirmed, each on their own
          Decentralization Manager node.
        </span>
        {seats ? (
          <span className="release-members">
            {seats.members.map((m) => (
              <span key={m} className="release-member">{hint(m)}</span>
            ))}
          </span>
        ) : null}
        <span className="release-sub quiet">
          {seats
            ? "Three member parties, each confirming on its own Decentralization Manager node, and the paying agent operates one of them - so this is not an outside veto, it is a payment no single member can release on its own. Whether those nodes are run by separate companies is a property of the deployment rather than of this control."
            : "The approvers own manager is not answering, so the membership cannot be shown here. The choice is still real: the run would name the party as a second executor either way."}
        </span>
      </label>
    </fieldset>
  );
}

/**
 * The agent's three steps on a coupon the issuer has already announced.
 *
 * The announcement is not here, and that is the point: `CorporateAction` is
 * the issuer's contract, and a console that filed it was one screen acting
 * for two companies. The issuer desk files it; this picks one up.
 *
 * What is genuinely the agent's is on this panel: which announcement to work,
 * how to round, and whether the run needs the approvers. A bond with nothing
 * announced is waiting on the issuer, and says so rather than offering a form.
 */
function CouponSetup({
  busy,
  open,
  pending,
  scheduleWithoutRun,
  approver,
  onEntitle,
  onCreateRun,
}: {
  busy: boolean;
  open: boolean;
  pending: Announcement[];
  /** A coupon already entitled and not yet prepared: the run is all it needs. */
  scheduleWithoutRun: { paymentDate: string; total: number } | null;
  approver: Party | null;
  onEntitle: (actionCid: string, recordDate: string, paymentDate: string, policy: string, approver: Party | null) => Promise<void>;
  onCreateRun: (approver: Party | null) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [policy, setPolicy] = useState("LargestRemainder");
  const [governed, setGoverned] = useState(!!approver);

  // No toggle. The panel shows what the SELECTED coupon still needs, and the
  // register rail is how you move between coupons. It used to collapse to a
  // "Work another coupon" link, from when the page was pinned to one coupon
  // and this panel was the only way to reach another; with the rail there,
  // that link was a second route to the same place under a different name.
  if (!open) return null;

  if (!pending.length) {
    return (
      <div className="action-second">
        {scheduleWithoutRun ? (
          <>
            {approver ? (
              <Release approver={approver} governed={governed} onChange={setGoverned} busy={busy} />
            ) : (
              <span className="action-note quiet">
                This run will be released by the paying agent alone, because this deployment has no approvers.
                If you started the stack with <code>--profile govern</code>, the choice appears here by itself
                once their party has been built, which takes a minute or two after the holders are seated. No
                reload needed.
              </span>
            )}
            <div className="coupon-actions">
              <button className="settle fix" disabled={busy} onClick={() => void onCreateRun(governed ? approver : null)}>
                {busy ? "Creating…" : `Create the run for ${scheduleWithoutRun.paymentDate}`}
              </button>
            </div>
          </>
        ) : null}
        <span className="action-note">
          {scheduleWithoutRun
            ? "The entitlements for this coupon are already on the ledger, so the run is the one step left. The announcement that produced them is gone: entitling one archives it, and the schedule is the record."
            : "Nothing announced on this bond for the paying agent to work. The issuer announces an event; the agent acts on it. Switch to the issuer desk at the top of the page to see that side."}
        </span>
      </div>
    );
  }

  const pick = pending.find((p) => p.cid === chosen) ?? pending[0];
  return (
    <div className="action-second coupon-setup">
      <div className="coupon-fields">
        <label>
          Announcement
          <select value={pick.cid} onChange={(e) => setChosen(e.target.value)} id="coupon-action">
            {pending.map((p) => (
              <option key={p.cid} value={p.cid}>
                {p.paymentDate} · {p.amountPerUnit} per unit · record {p.recordDate}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rounding
          <select value={policy} onChange={(e) => setPolicy(e.target.value)} id="coupon-policy">
            <option value="LargestRemainder">Largest remainder</option>
            <option value="RoundHalfUpResidualToIssuer">Half up, residual to the issuer</option>
          </select>
        </label>
      </div>
      {approver ? <Release approver={approver} governed={governed} onChange={setGoverned} busy={busy} /> : null}
      <div className="coupon-actions">
        <button
          className="settle fix"
          disabled={busy}
          onClick={() => void onEntitle(pick.cid, pick.recordDate, pick.paymentDate, policy, governed ? approver : null)}
        >
          {busy ? "Working…" : "Freeze the register, derive the schedule, create the run"}
        </button>
      </div>
      <span className="action-note">
        Three ledger steps, in order. The register is frozen as the registrar, which in this deployment is the
        paying agent. The schedule is then derived on the ledger from the announcement and that snapshot, so it
        is checkable rather than uploaded, and the run follows from the schedule leg for leg.
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
  const { currency, legs, expectedAllocations, haveAllocations, settled, units, exactTotal } = run;
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
  // What the agent can authorise RIGHT NOW, which is not the same as what is
  // missing: a holder who has given no settlement instructions cannot be
  // authorised by anyone here, and the rest can. Found 7 October, when a run
  // with one holder outstanding offered no control at all and four cards sat
  // on TO AUTHORISE with nothing on the page that would move them.
  const toAuthorise = run.counts.unauthorised;
  const canAuthorise = !!state?.run && !settled && (toAuthorise > 0 || !state.allocations.some((a) => a.isSend));
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
        <Kpi label="Authorised to pay">
          <span className="kpi-num">
            {settled ? expectedAllocations : ready}
            <span className="kpi-of"> / {expectedAllocations}</span>
          </span>
          <div className="meter" role="img" aria-label={`${ready} of ${expectedAllocations} payments authorised on the ledger`}>
            <div className={`meter-fill${settled ? " done" : pct === 100 ? " full" : ""}`} style={{ width: `${settled ? 100 : pct}%` }} />
          </div>
          <span className="kpi-sub">
            the agent's own, plus {legs} holder{legs === 1 ? "" : "s"}{settled ? ", all used by the settlement" : null}
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
        {/* The whole run's state in one line, beside the button that acts on
            it. The numbers are what the cards add up to, and the words say
            whose move each group is: an operator looking at a disabled settle
            should not have to open a tab to find out who is holding it up. */}
        {state?.run || settled ? (
          <div className="leg-counts" role="group" aria-label="Legs by state">
            {(["blocked", "unauthorised", "ready", "paid"] as LegStatus[])
              .filter((s) => run.counts[s] > 0)
              .map((s) => (
                <span key={s} className={`leg-status ${s}`}>
                  {run.counts[s]} {TURN[s]}
                </span>
              ))}
          </div>
        ) : null}
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
                      ? "This run is not ready to ask about: not every payment is authorised yet, so the settlement would fail after the approvers had agreed to it. Their job is to decide whether the payment goes out, not to check the data."
                      : "All or nothing, and not alone: this run names an approver, so the agent cannot settle it. The button signs a request instead. The cash these allocations lock is committed to the approvers too, so releasing it is their decision as much as the agent's."
                  : "All or nothing. If any leg cannot settle, nothing moves."}
        </div>
        {/* The fix, where the problem is stated. This was a terminal until
            7 October: demo.ps1 prepare, or docker compose run --rm prepare.
            It creates only what is absent, so pressing it twice is safe and
            it is deliberately not disabled after a press. */}
        {/* A holder who has given no settlement instructions is not something
            the agent can fix. Say so, name them, and send the operator to the
            one page where it can be fixed - but do not let it suppress the
            work the agent CAN do, which is the rest of the batch. */}
        {!settled && run.noInstructions.length > 0 ? (
          <div className="action-second">
            <span className="action-note">
              <strong>
                {run.noInstructions.length === 1
                  ? `${run.noInstructions[0]} has given no settlement instructions.`
                  : `${run.noInstructions.length} holders have given no settlement instructions.`}
              </strong>{" "}
              The paying agent has nowhere to send their money, so the ledger will refuse the whole run rather
              than pay everyone else. Nothing here fixes it: the holder provides them, once, on their own page
              under <strong>Holder</strong>. Every coupon after that needs nothing from them.
            </span>
          </div>
        ) : null}
        {/* Whose turn it is, said rather than implied. The order matters and
            only the page knows it: a holder provides instructions, then the
            agent authorises under them, then the settle can go. Leaving the
            operator to infer that from a button appearing sent one straight to
            settle, which was refused for a reason they could not read. */}
        {!settled && toAuthorise > 0 && state?.run ? (
          <div className="action-second">
            <span className="action-note">
              <strong>
                {toAuthorise === 1
                  ? "One payment has settlement instructions on file and is not authorised yet."
                  : `${toAuthorise} payments have settlement instructions on file and are not authorised yet.`}
              </strong>{" "}
              The agent authorises each holder's side under the instructions they gave, and only then can the
              batch settle. Press the button below first; settling before it is refused, correctly, because the
              authorisation is not on the ledger.
            </span>
          </div>
        ) : null}
        {/* Offered whenever there is something the agent can authorise, which
            is not the same as "the run is incomplete": a run can stay
            incomplete forever while a holder owes their details, and the
            agent's own work still has to be doable. The label counts the
            payments it will actually authorise, not the gap in the meter. */}
        {!config.readOnly && canAuthorise ? (
          <div className="action-second">
            <button className="settle fix" disabled={pressed.kind === "busy"} onClick={agent.onPrepare}>
              {pressed.kind === "busy"
                ? "Authorising…"
                : toAuthorise > 0
                  ? `Authorise the ${toAuthorise} remaining payment${toAuthorise === 1 ? "" : "s"}`
                  : "Set the agent's own cash aside"}
            </button>
            <span className="action-note">
              The paying agent does this alone, under the settlement instructions each holder gave once. No
              holder is asked for anything. In a deployment it happens by itself when the run is prepared.
              {run.noInstructions.length > 0
                ? " It cannot authorise the holder above, who has given no instructions, so the run stays short of one payment until they do."
                : null}
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
            pending={run.pending}
            scheduleWithoutRun={!state?.run && state?.schedule ? { paymentDate: state.schedule.paymentDate, total: state.schedule.total } : null}
            approver={config.decmanParty}
            onEntitle={agent.onEntitle}
            onCreateRun={agent.onCreateRun}
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
