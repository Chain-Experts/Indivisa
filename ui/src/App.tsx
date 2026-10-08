import { useCallback, useEffect, useMemo, useState } from "react";
import { displayName, loadConfig, type Config } from "./config";
import { Tabs } from "./components/Tabs";
import { Money } from "./components/Money";
import { CopyId } from "./components/CopyId";
import { LegTable, type LegStatus } from "./components/LegTable";
import { RunBar, type RunSummary } from "./panes/RunBar";
import { Holders, type HolderRow } from "./panes/Holders";
import { Privacy } from "./panes/Privacy";
import { Activity } from "./panes/Activity";
import { HolderList, HolderPage } from "./panes/Holder";
import { ApproverList, ApproverPage } from "./panes/Approver";
import { committee, type Committee } from "./ledger/decman";
import { completeSignIn, currentOperator, resumeSession, signIn, signOut, type Operator, type OperatorAuth } from "./auth";
import { useAgent } from "./state/useAgent";
import { useVote } from "./state/useVote";
import { groupByNode, useHolders } from "./state/useHolders";
import { Ledger, type Party } from "./ledger/client";
import { book as readBook, announcements, issuerBonds, type Coupon, type Announcement, type CouponTerms, type IssuerBond } from "./ledger/queries";

/**
 * A ledger timestamp as something an operator can read.
 *
 * Falls back to the raw string on anything it cannot parse, because a refusal
 * with an odd timestamp is still a refusal and the formatting must never be
 * the thing that blanks the line.
 */
function whenRefused(at: string | undefined): string {
  if (!at) return "at an unrecorded time";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

// The console: one working header, one command, and four ways of looking at
// the same run. Every figure is read from the participant that holds it;
// there is no application backend and nothing is cached between views.
export function App() {
  // `undefined` means we have not yet asked whether sign-in is required.
  const [auth, setAuth] = useState<OperatorAuth | null | undefined>(undefined);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Whether this deployment requires an operator, and where they sign in.
  // Served from /demo, which is the one thing the proxy leaves open - the
  // page cannot sign in without first being told where to.
  //
  // The seed writes this file last, so it is also the "is the demo ready"
  // signal, and waiting for it is the normal first minutes of a fresh stack.
  // Do not parse the body before checking the status: a judge who opens the
  // page while it is still seating gets the web server's own HTML 404, and
  // reading that as JSON failed with `Unexpected token '<'`, which reads as a
  // broken application rather than as "not ready yet".
  useEffect(() => {
    let live = true;
    let timer: number | undefined;
    const read = async (): Promise<boolean> => {
      try {
        const r = await fetch("/demo/participants.json");
        if (!r.ok) return false;
        const m = (await r.json()) as { operator?: OperatorAuth | null };
        if (live) setAuth(m.operator ?? null);
        return true;
      } catch {
        return false;
      }
    };
    const tick = async () => {
      if (!live || (await read())) return;
      timer = window.setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      live = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  // Finish a redirect back from the identity provider, or pick up a session
  // already in this tab.
  useEffect(() => {
    if (auth === undefined) return;
    if (!auth) {
      setReady(true);
      return;
    }
    // Either this load is the redirect back from Keycloak, or there is a
    // session already in the tab. Both end with a token in the headers or no
    // operator at all; neither leaves one without a scheduled refresh.
    completeSignIn(auth)
      .then((fresh) => setOperator(fresh ? currentOperator() : resumeSession(auth)))
      .catch((e) => setError(String(e)))
      .finally(() => setReady(true));
  }, [auth]);

  // Only now read the ledger: every one of those requests is refused without
  // an operator, so loading first would just produce a page of failures.
  useEffect(() => {
    if (!ready) return;
    if (auth && !operator) return;
    loadConfig().then(setConfig).catch((e) => setError(String(e)));
  }, [ready, auth, operator]);

  // The approvers can arrive AFTER the config has been read, and this is a
  // race I made on 8 October by running `govern-seed` in parallel with the
  // holder seat.
  //
  // `participants.json` is the seed's readiness signal, written last, and the
  // page loads its config the moment it appears. `govern-seed` then **edits
  // that same file** to add the decentralised party, a few seconds later. So a
  // page opened at "Ready" had no approvers party, the release choice offered
  // no options, and only a reload fixed it. Avraham hit it on the first clean
  // run; I had not, because I reloaded between steps while testing.
  //
  // Re-read while the party is absent, and **only swap the config when it
  // actually appears**: `config` is a dependency of the ledger connections and
  // the register poll, so replacing it on a timer would restart those every
  // five seconds. On a stack with no approvers at all this polls one small
  // local file and changes nothing, which is the honest cost of there being no
  // signal that tells "not yet" from "never".
  useEffect(() => {
    if (!config || config.decmanParty) return;
    let live = true;
    const t = window.setInterval(async () => {
      try {
        const r = await fetch("/demo/participants.json");
        if (!r.ok) return;
        const m = (await r.json()) as { decman?: { party?: string } | null };
        if (!live || !m.decman?.party) return;
        window.clearInterval(t);
        const fresh = await loadConfig();
        if (live) setConfig(fresh);
      } catch {
        // Keep trying: a 404 while the seed rewrites the file is normal.
      }
    }, 5000);
    return () => { live = false; window.clearInterval(t); };
  }, [config]);

  if (error) return <div className="boot error">{error}</div>;
  if (auth === undefined)
    return (
      <div className="boot">
        Waiting for the demo to finish seating. On a fresh stack this takes a few minutes; the page
        picks it up by itself.
      </div>
    );
  if (!ready) return <div className="boot">Starting…</div>;
  if (auth && !operator) return <SignIn auth={auth} />;
  if (!config) return <div className="boot">Loading the seat…</div>;
  return <Console config={config} operator={operator} auth={auth} />;
}

function SignIn({ auth }: { auth: OperatorAuth }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="boot signin">
      <div className="signin-card">
        <img className="logo" src="/indivisa-logo.png" alt="" width={66} height={44} />
        <h1>Indivisa</h1>
        <p>This console settles money. Sign in before it will read or write anything.</p>
        <button
          className="go"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            signIn(auth).catch(() => setBusy(false));
          }}
        >
          {busy ? "Taking you to sign in…" : "Sign in"}
        </button>
        <p className="muted">
          The paying agent's own ledger credential stays on the server and never reaches this page. Signing in
          identifies <em>you</em>, so that who asked for a settlement is a question with an answer.
        </p>
      </div>
    </div>
  );
}

/**
 * Take back a request that should not have been made.
 *
 * A paying agent that can ask for a settlement must be able to stop asking:
 * the wrong run, the wrong day, a figure noticed too late. Without this the
 * only remedy is to leave a live request on the ledger and tell the approvers
 * by other means not to act on it, which is not a control, it is an email.
 *
 * Deliberately two presses. One is too few for an action that is visible to
 * another company, and a confirmation that names what is being withdrawn is
 * the cheapest possible guard against the wrong click.
 */
function Withdraw({ busy, confirmations, onWithdraw }: { busy: boolean; confirmations: number; onWithdraw: () => Promise<void> }) {
  const [arming, setArming] = useState(false);
  if (!arming) {
    return (
      <div className="outcome-line">
        <button className="linklike" disabled={busy} onClick={() => setArming(true)}>
          Withdraw this request
        </button>
      </div>
    );
  }
  return (
    <div className="outcome-line withdraw-confirm">
      <span>
        Withdraw the request? It is archived on the ledger, and both the request and the withdrawal stay in the
        history.
        {confirmations > 0 ? (
          <span className="muted">
            {" "}
            {confirmations === 1 ? "One approver has" : `${confirmations} approvers have`} already confirmed; the
            request will disappear from their approvals.
          </span>
        ) : null}
      </span>
      <span className="withdraw-actions">
        <button className="danger" disabled={busy} onClick={() => { setArming(false); void onWithdraw(); }}>
          {busy ? "Withdrawing…" : "Withdraw"}
        </button>
        <button className="linklike" disabled={busy} onClick={() => setArming(false)}>
          Keep it
        </button>
      </span>
    </div>
  );
}

/**
 * The register, down the left.
 *
 * A paying agent works a book, so the book is the first thing on the page and
 * stays there: which instrument you are looking at is a standing fact, not a
 * control you reach for. Everything to the right follows it, including which
 * desk you are at.
 *
 * Finished coupons stay on the list on purpose. Most of a real book is
 * finished, and a settled coupon is still something an operator opens, to read
 * its receipt and its update id.
 */
/**
 * Which desk you are at, from the address.
 *
 * Three pages rather than a toggle, because in a deployment these are three
 * companies: `/` the paying agent, `/issuer` the issuer, `/holders` the
 * register and each holder's own page. nginx already serves index.html for
 * every path, so no server change is needed.
 *
 * It is still one deployment with one login, and each page says so. The links
 * between them are a convenience of the demo, not something a real operator
 * would have.
 */
function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((to: string) => {
    window.history.pushState({}, "", to);
    setPath(to);
  }, []);
  return { path, go };
}

/**
 * The way between the three desks, marked as what it is.
 *
 * It used to sit inside the header, where it read as one application's
 * navigation. That is the opposite of the point: these are three companies,
 * and no operator would ever have a button that turns them into another firm.
 * It is a convenience of the demo, so it sits above the application and says
 * so, instead of pretending to be part of it.
 */
function DeskSwitch({ path, go }: { path: string; go: (to: string) => void }) {
  const here = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const desks: [string, string][] = [
    ["/", "Paying agent"],
    ["/issuer", "Issuer"],
    ["/holders", "Holder"],
    ["/approvers", "Approver"],
  ];
  return (
    <div className="deskbar">
      <span className="deskbar-note">
        <strong>Demo.</strong> These are four different companies. In a deployment each runs its own
        application and signs in to it; here they are four pages so you can walk between them. You are at the
      </span>
      <nav className="desks" aria-label="Desk">
        {desks.map(([to, label]) => (
          <button
            key={to}
            className={here(to) ? "desk on" : "desk"}
            aria-current={here(to) ? "page" : undefined}
            onClick={() => go(to)}
          >
            {label}
          </button>
        ))}
      </nav>
      <span className="deskbar-note">desk.</span>
    </div>
  );
}

/**
 * The register, down the left: every coupon the agent has to work, grouped
 * under the bond that pays it.
 *
 * One row per bond was wrong as soon as a bond had two coupons, because the
 * row carried only the latest one and the earlier one could not be selected
 * at all. A bond pays twice a year for ten years; the unit of work is the
 * event, not the instrument, which is also what a paying agent's blotter
 * looks like.
 */
function RegisterRail({ book, picked, onPick }: { book: Coupon[]; picked: string; onPick: (key: string) => void }) {
  const label: Record<string, string> = {
    announced: "announced",
    scheduled: "entitled",
    prepared: "prepared",
    settled: "paid",
  };
  // Already sorted by bond then payment date, so grouping is a fold.
  const groups: { isin: string; name: string; rows: Coupon[] }[] = [];
  for (const row of book) {
    const last = groups[groups.length - 1];
    if (last && last.isin === row.isin) last.rows.push(row);
    else groups.push({ isin: row.isin, name: row.name, rows: [row] });
  }
  return (
    <nav className="rail" aria-label="Register">
      <div className="rail-head">Register</div>
      {book.length === 0 ? <div className="rail-empty">Reading the ledger…</div> : null}
      {groups.map((g) => (
        <div className="rail-group" key={g.isin}>
          <div className="rail-bond">
            <span className="rail-name">{g.name}</span>
            <span className="rail-isin">{g.isin}</span>
          </div>
          {g.rows.map((r) => (
            <button
              key={r.key}
              className={`rail-coupon${r.key === picked ? " on" : ""}`}
              aria-current={r.key === picked ? "true" : undefined}
              onClick={() => onPick(r.key)}
            >
              <span className="rail-date">{r.paymentDate ?? "no coupon yet"}</span>
              {r.stage ? <span className={`rail-state ${r.stage}`}>{label[r.stage]}</span> : null}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

/**
 * The issuer's desk.
 *
 * A separate screen because it is a separate company. `CorporateAction` is
 * signed by the issuer and only observed by the paying agent: the issuer
 * declares the terms of an event, and the agent then works out who is owed
 * what and pays them. One console doing both was a harness pretending to be a
 * product.
 *
 * It is still one browser tab holding both credentials, and that is said here
 * rather than hidden, the same way the holders tab says it. In a deployment
 * these are two applications at two companies, each with its own sign-in and
 * its own ledger credential; the split here is honest about the shape and not
 * about the isolation.
 */
function IssuerDesk({
  config,
  issuers,
  seatIsin,
  tag,
  busy,
  failure,
  onAnnounce,
}: {
  config: Config;
  issuers: Party[];
  seatIsin: string;
  tag: string;
  busy: boolean;
  failure: string | null;
  /** Resolves true only if the announcement actually landed on the ledger, so
   *  the desk confirms what happened rather than what was attempted. */
  onAnnounce: (issuerParty: Party, isin: string, currency: string, terms: CouponTerms) => Promise<boolean>;
}) {
  // Read as the ISSUER, from the issuer's own node.
  //
  // This desk used to take its bond list and its announcements from the paying
  // agent's read of the register, and to work out which bond you meant from
  // the register rail on the left, which is the agent's own blotter. An issuer
  // has no sight of the agent's book and no route to its node, so the desk was
  // borrowing another company's view to answer a question of its own.
  // `Instrument` is observed by the issuer and `CorporateAction` is signed by
  // it, so both of these lists are genuinely the issuer's to read - and the
  // instrument carries the currency, which was the last thing this screen
  // needed the agent's panes for.
  // A reader per issuer, because each bond has its own issuer since
  // 9 October and an issuer observes only its own `Instrument` contracts.
  // There is deliberately no party here that can see all three: the paying
  // agent can, and borrowing its view is what this desk stopped doing.
  const readers = useMemo(
    () => issuers.map((p) => new Ledger(config.baseOf(config.participantOf(p)), p)),
    [config, issuers],
  );
  const [bonds, setBonds] = useState<IssuerBond[]>([]);
  const [announced, setAnnounced] = useState<Announcement[]>([]);
  // Lifted out of the effect so the press can call it. The five-second tick is
  // the background case; measured on this stack, a row took most of a minute
  // to appear after a successful announcement, because the console starves its
  // own timers (see "One poll, one reader"). Re-reading on the press puts the
  // row up at the one moment anybody is looking at it, which is also the
  // moment that is on camera.
  const read = useCallback(() => {
    void Promise.all(readers.map(issuerBonds))
      .then((rs) => setBonds(rs.flat().sort((x, y) => (x.name < y.name ? -1 : 1))))
      .catch(() => {});
    void Promise.all(readers.map((r) => announcements(r)))
      .then((rs) => setAnnounced(rs.flat().sort((x, y) => (x.paymentDate < y.paymentDate ? 1 : -1))))
      .catch(() => {});
  }, [readers]);
  useEffect(() => {
    read();
    const t = setInterval(read, 5000);
    return () => clearInterval(t);
  }, [read]);

  // The bond is chosen HERE, rather than inherited from a selection made on
  // another desk. The old behaviour was a hazard dressed as a convenience: the
  // announcement landed on whatever the rail happened to have selected, there
  // is no undo, and a coupon announced on the wrong bond stays in the register
  // until the stack is reseated.
  const [isin, setIsin] = useState("");
  const chosen = bonds.find((b) => b.isin === isin) ?? null;
  useEffect(() => {
    if (isin !== "" || bonds.length === 0) return;
    setIsin(bonds.some((b) => b.isin === seatIsin) ? seatIsin : bonds[0].isin);
  }, [bonds, isin, seatIsin]);

  const [rate, setRate] = useState("");
  const [recordDate, setRecordDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  // The issuer's release term. Default off, because releasing on the agent's
  // own authority is the ordinary case and the main product; requiring more
  // than one company is the exception an issuer chooses for a payment it
  // wants guarded.
  const [requiresApprovers, setRequiresApprovers] = useState(false);
  // What was announced by the last press, if it landed.
  //
  // Without this the press said nothing at all: the button stayed enabled,
  // the three values stayed in the boxes, and the only evidence was a row
  // appearing in a table further down the page. Avraham hit it during the
  // shoot and could not tell whether to press again. Pressing again was in
  // fact harmless, because `announce` is idempotent on the bond and the two
  // dates, but "harmless" is not the same as "legible".
  const [just, setJust] = useState<{ name: string; paymentDate: string } | null>(null);
  const ready = !!chosen && rate.trim() !== "" && recordDate !== "" && paymentDate !== "";
  const nameOf = (i: string) => bonds.find((b) => b.isin === i)?.name ?? i;

  return (
    <div className="issuer">
      <div className="issuer-head">
        <h2>Announce an event</h2>
        <p>
          You are at the <strong>issuer&apos;s</strong> desk. An issuer declares the terms of a coupon, a dividend
          or a redemption and nothing else: it does not see the register, work out the entitlements or move the
          cash. The paying agent picks the announcement up on its own screen.
        </p>
        <p>
          <strong>There is no register on this desk, deliberately.</strong> The list of coupons on the paying
          agent&apos;s screen is the agent&apos;s own book, and an issuer has no sight of who holds its bond and
          no route to the agent&apos;s node. Everything here is read from the issuer&apos;s own participant: the
          bonds it has issued, and the announcements it has made that the agent has not worked yet.
        </p>
      </div>

      {bonds.length === 0 ? (
        <p className="action-note">Reading your bonds from your own node…</p>
      ) : (
        <div className="issuer-form">
          <div className="coupon-fields bond">
            <label>
              Bond
              <select value={isin} onChange={(e) => { setIsin(e.target.value); setJust(null); }} id="ann-bond">
                {bonds.map((b) => (
                  <option key={b.isin} value={b.isin}>{b.name} · {b.isin}</option>
                ))}
              </select>
            </label>
          </div>
          {chosen ? (
            <p className="action-note acting">
              Announcing as <strong>{displayName(chosen.issuer, tag)}</strong>, the issuer of this bond. Each bond on
              this desk has an issuer of its own, and the announcement is signed by that company and no other.
            </p>
          ) : null}
          <div className="coupon-fields">
            <label>
              Per unit
              <input value={rate} onChange={(e) => { setRate(e.target.value); setJust(null); }} inputMode="decimal" id="ann-rate" />
            </label>
            <label>
              Record date
              <input value={recordDate} onChange={(e) => { setRecordDate(e.target.value); setJust(null); }} type="date" id="ann-record" />
            </label>
            <label>
              Payment date
              <input value={paymentDate} onChange={(e) => { setPaymentDate(e.target.value); setJust(null); }} type="date" id="ann-payment" />
            </label>
          </div>
          {/* The one control on this screen with a consequence for somebody
              else, and the reason it is on THIS screen. The approvers exist to
              stop a paying agent releasing a payout unchecked, and until
              indivisa 0.5.0 the agent ticked this box itself, which protected
              nobody: the party being guarded against chose the guard. The cash
              is the issuer's, the agent is a conduit, and CorporateAction is
              the issuer's own contract. The term is set here, the agent reads
              it, and the ledger refuses a settlement that ignores it. */}
          <fieldset className="release" disabled={busy}>
            <legend>How may this coupon be released?</legend>
            <label className={requiresApprovers ? "release-opt" : "release-opt on"}>
              <input
                type="radio"
                name="issuer-release"
                id="issuer-release-agent"
                checked={!requiresApprovers}
                onChange={() => setRequiresApprovers(false)}
              />
              <span className="release-main">By the paying agent, on its own authority</span>
              <span className="release-sub">
                The ordinary case, and how a paying agent works today. It pays when it is ready.
              </span>
            </label>
            <label className={requiresApprovers ? "release-opt on" : "release-opt"}>
              <input
                type="radio"
                name="issuer-release"
                id="issuer-release-approvers"
                checked={requiresApprovers}
                onChange={() => setRequiresApprovers(true)}
              />
              {/* "cannot", not "may not". "May not" carries two readings in
                  English, a prohibition and a possibility, and on a payments
                  screen the possibility reading is the wrong one entirely: it
                  turns a term of the event into a maybe. "Cannot" is also the
                  literally true statement, because the guard is on
                  `Run_Settle` and the ledger refuses the settlement rather
                  than merely discouraging it. */}
              <span className="release-main">This coupon cannot be released by the paying agent alone</span>
              <span className="release-sub">
                A term of the event, recorded on this announcement and carried to the payment schedule. The
                paying agent can read it and cannot change it, and the ledger refuses a settlement that names no
                second authority against it. Who that second authority is, is the agent&apos;s own arrangement
                and not yours to name.
              </span>
            </label>
          </fieldset>
          <div className="coupon-actions">
            <button
              className="settle"
              disabled={busy || !ready}
              onClick={() => {
                if (!chosen) return;
                const announcing = { name: chosen.name, paymentDate };
                void onAnnounce(chosen.issuer, chosen.isin, chosen.currency, {
                  amountPerUnit: rate.trim(),
                  recordDate,
                  paymentDate,
                  policy: "LargestRemainder",
                  requiresApprovers,
                }).then((landed) => {
                  read();
                  if (!landed) return;
                  // Empty the form, because the next announcement is a
                  // different coupon. The release choice is left as it is:
                  // it is a visible radio, so nothing is hidden by keeping it.
                  setJust(announcing);
                  setRate("");
                  setRecordDate("");
                  setPaymentDate("");
                });
              }}
            >
              {busy ? "Announcing…" : chosen ? `Announce a coupon on ${chosen.name}` : "Announce a coupon"}
            </button>
          </div>
          {just ? (
            <p className="action-note announced">
              <strong>Announced.</strong> The {just.name} coupon paying {just.paymentDate} is on the ledger and is
              now waiting on the paying agent, which can freeze the register and derive the schedule from it. It
              is in the list below. Nothing further is needed from this desk.
            </p>
          ) : null}
          <p className="action-note">
            The rate is cash per unit of quantity, so 21.875 on a 1,000 denomination is a 4.375% semi-annual
            coupon. The record date decides who is paid; the payment date decides when, and names the run. How the
            rounding is done is the paying agent&apos;s decision, not yours, so it is not on this form.
          </p>
          <p className="action-note disclosure">
            <strong>A real issuer would not type these three figures.</strong> A bond&apos;s terms are fixed in
            its prospectus at issuance, so the rate and the coupon dates for its whole life are already known:
            the issuer&apos;s own system announces the next one from that calendar, and an operator confirms
            rather than composes it. This form stands in for that calendar, and for the register feed that would
            carry the instrument and the positions. The ledger steps it files are the real ones.
          </p>
          {failure ? <p className="action-note warn">{failure}</p> : null}
        </div>
      )}

      <div className="issuer-list">
        <h3>Waiting on the paying agent</h3>
        {announced.length ? (
          <table className="plain">
            <thead>
              <tr><th>Bond</th><th>Pays</th><th>Record</th><th>Per unit</th><th>Kind</th><th>Release</th></tr>
            </thead>
            <tbody>
              {announced.map((a) => (
                <tr key={a.cid}>
                  <td>{nameOf(a.isin)}</td>
                  <td>{a.paymentDate}</td>
                  <td>{a.recordDate}</td>
                  <td className="num">{a.amountPerUnit}</td>
                  <td>{a.kind}</td>
                  <td>
                    {a.requiresApprovers ? (
                      <span className="leg-status unauthorised">not by the agent alone</span>
                    ) : (
                      <span className="muted">the agent&apos;s own authority</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="action-note">
            Nothing waiting, on any of your bonds. An announcement leaves this list when the paying agent works
            it: entitling one archives it and puts an entitlement schedule in its place, so the ledger keeps the
            result rather than the request.
          </p>
        )}
      </div>
    </div>
  );
}

function Console({ config, operator, auth }: { config: Config; operator: Operator | null; auth: OperatorAuth | null }) {
  const { seat } = config;

  // Every issuer this console holds a credential for, one per bond. A seat
  // written before 9 October has a single issuer for all three bonds and no
  // "issuers" field, so fall back to it rather than showing an empty desk:
  // the result is simply the old behaviour, three bonds under one name.
  const issuerParties = useMemo<Party[]>(
    () => (seat.issuers?.length ? seat.issuers : [seat.issuer]),
    [seat.issuers, seat.issuer],
  );

  // The book: every bond on the agent's register, re-read with the page. The
  // seat file names only the one it created, and a paying agent keeps more
  // than one, so the list comes from the ledger and the seat is only the
  // default selection.
  const [book, setBook] = useState<Coupon[]>([]);
  const bookLedger = useMemo(
    () => new Ledger(config.baseOf(config.participantOf(seat.payingAgent)), seat.payingAgent),
    [config, seat.payingAgent],
  );
  useEffect(() => {
    let live = true;
    const read = () => readBook(bookLedger).then((b) => { if (live) setBook(b); }).catch(() => {});
    read();
    const t = setInterval(read, 5000);
    return () => { live = false; clearInterval(t); };
  }, [bookLedger]);

  // Who the approvers are, read once from the live governance rules. Both the
  // release choice and the approvers desk need it, so it is read here rather
  // than twice.
  const [theCommittee, setTheCommittee] = useState<Committee | null>(null);
  useEffect(() => {
    if (!config.decmanParty) return;
    let live = true;
    committee(config.decmanParty)
      .then((c) => { if (live) setTheCommittee(c); })
      .catch(() => { if (live) setTheCommittee(null); });
    return () => { live = false; };
  }, [config.decmanParty]);

  // The announcements on the bond in view. The agent observes these; the
  // issuer desk is where they are made.
  const [allAnnounced, setAllAnnounced] = useState<Announcement[]>([]);
  const pending = allAnnounced;
  // The selection is a COUPON, keyed by its run id, not a bond. The seat's
  // own run is the default, which is the first coupon on the first bond and
  // the one the walkthrough starts on.
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const picked = book.find((b) => b.key === (pickedKey ?? seat.runId)) ?? null;
  const isin = picked?.isin ?? seat.isin;
  // A coupon that has been announced but not entitled has no run to read, and
  // the seat's run id would be the wrong one. An id nothing matches is the
  // honest answer: the panes then show the register and no coupon figures.
  const runId = picked ? (picked.runId ?? `${picked.key}/none`) : seat.runId;

  const agent = useAgent(config, isin, runId);
  useEffect(() => {
    let live = true;
    const read = () =>
      announcements(bookLedger, isin)
        .then((a) => { if (live) setAllAnnounced(a); })
        .catch(() => {});
    read();
    const t = setInterval(read, 5000);
    return () => { live = false; clearInterval(t); };
  }, [bookLedger, isin]);
  // The vote only exists while a proposal is outstanding, and only on a
  // network that has a Decentralization Manager configured.
  // The agent's own strip votes on the SELECTED run's request, and only that:
  // feeding it the newest request on the ledger would put an execute button on
  // a coupon that was never asked about.
  const voting = useVote(
    config.decmanParty,
    agent.state?.proposal?.cid ?? null,
    agent.ledgers.agent,
    agent.ledgers.registry,
    seat.rulesCid,
    agent.state?.schedule?.cid ?? null,
    agent.refresh,
  );
  // Read before the votes below: one of them polls only while the approvers'
  // desk is open, so it needs the route.
  const { path, go } = useRoute();
  // A second vote, for the approvers' desk, on whatever request is actually
  // outstanding. Deliberately NOT the same one: a member does not know which
  // coupon the agent has open, and feeding the agent's strip this one would
  // put an execute button on a coupon nobody asked about. It polls only while
  // that desk is open, which is what the null does.
  const approverVoting = useVote(
    config.decmanParty,
    path.startsWith("/approvers") ? (agent.state?.openProposals[0]?.cid ?? null) : null,
    agent.ledgers.agent,
    agent.ledgers.registry,
    seat.rulesCid,
    // Null on purpose: this handle never executes, and the schedule on the
    // agent's screen may belong to a different coupon from the request the
    // approvers are looking at.
    null,
    agent.refresh,
  );
  const currency = agent.state?.instrument?.currency ?? picked?.currency ?? "USD";
  // The register of the bond on screen, not the seat's fixed list: a second
  // bond has holders of its own, and some of them hold nothing else.
  const bondHolders = picked?.holders ?? seat.holders;
  const holders = useHolders(config, currency, bondHolders, isin, agent.runId);
  const byNode = useMemo(() => groupByNode(config, bondHolders), [config, bondHolders]);
  const [tab, setTab] = useState("holders");
  const desk: "agent" | "issuer" | "holders" | "approvers" = path.startsWith("/issuer")
    ? "issuer"
    : path.startsWith("/holders")
      ? "holders"
      : path.startsWith("/approvers")
        ? "approvers"
        : "agent";
  // /holders/<party> opens one holder; /holders alone is the register.
  const openHolder = path.startsWith("/holders/") ? decodeURIComponent(path.slice("/holders/".length)) : null;
  // /approvers/<node> opens one member; /approvers alone is the committee.
  const openApprover = path.startsWith("/approvers/") ? decodeURIComponent(path.slice("/approvers/".length)) : null;

  const state = agent.state;
  const settled = state?.receipt != null;
  const legs = state?.run?.legs ?? state?.schedule?.entries.length ?? seat.legs;
  // The holders whose own receipt allocation is on the ledger. The send
  // allocation is the agent's own and has no holder, so it drops out.
  const authorised = useMemo(
    () => new Set((state?.allocations ?? []).filter((a) => !a.isSend).map((a) => a.authorizer).filter(Boolean) as string[]),
    [state?.allocations],
  );
  // Who has given the agent somewhere to send the money. From the agent's own
  // state, not the holders' cards, so it arrives in the same poll as
  // `authorised` above: a card that says whose turn it is would otherwise be
  // able to read the two halves from different moments and name the wrong one.
  const instructed = useMemo(() => new Set(state?.instructed ?? []), [state?.instructed]);
  // Four states, and between them they say whose move it is. "Not ready" was
  // one state until 7 October and it conflated two different problems: a
  // holder who owes their settlement instructions, which nothing on this page
  // can fix, and a payment the agent has not authorised yet, which is one
  // button away. On the governed path every card read WAITING for both.
  const statusOf = (party: string): LegStatus =>
    settled ? "paid" : authorised.has(party) ? "ready" : instructed.has(party) ? "unauthorised" : "blocked";

  const rows: HolderRow[] = useMemo(() => {
    const due = new Map<string, { units: number; amount: number; exact: number }>();
    for (const e of state?.schedule?.entries ?? [])
      due.set(e.holder, { units: Number(e.quantity), amount: Number(e.amount), exact: Number(e.exact) });
    return bondHolders.map((party) => {
      const facts = holders.facts.get(party);
      const d = due.get(party);
      return {
        party,
        name: displayName(party, seat.tag),
        node: config.participantOf(party),
        // The holder's own register entry where the node has answered;
        // the agent's schedule until then.
        units: facts?.units || d?.units || 0,
        due: d?.amount ?? facts?.allocated ?? 0,
        exact: d?.exact ?? d?.amount ?? 0,
        facts,
        status: statusOf(party),
      };
    });
  }, [config, holders.facts, bondHolders, seat.tag, state?.schedule, authorised, instructed, settled]);

  // The holders nothing on this desk can fix, named so the note can name them.
  // Everything else the page needs about who is where comes from `counts`.
  const noInstructions = rows.filter((r) => r.status === "blocked").map((r) => r.name);
  const counts = useMemo(() => {
    const c = { blocked: 0, unauthorised: 0, ready: 0, paid: 0 } as Record<LegStatus, number>;
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);
  // Straight from the schedule, not from the cards: these are the figures the
  // amounts were derived from.
  const entries = state?.schedule?.entries ?? [];
  const units = entries.reduce((s, e) => s + Number(e.quantity), 0);
  const exactTotal = entries.reduce((s, e) => s + Number(e.exact), 0);
  const roundedUp = entries.filter((e) => Number(e.amount) > Number(e.exact)).length;
  const roundedDown = entries.filter((e) => Number(e.amount) < Number(e.exact)).length;
  const run: RunSummary = {
    isin,
    runId: agent.runId,
    pending,
    currency,
    legs,
    expectedAllocations: legs + 1,
    haveAllocations: state?.allocations.length ?? 0,
    authorised,
    noInstructions,
    counts,
    settled,
    units,
    exactTotal,
  };

  return (
    <div className="app">
      <DeskSwitch path={path} go={go} />
      <header className="top">
        <div className="brand">
          <img className="logo" src="/indivisa-logo.png" alt="" width={66} height={44} />
          <div className="brand-text">
            <div className="wordmark">Indivisa</div>
            <div className="tagline">Corporate actions, settled in one atomic batch, without exposing the register.</div>
          </div>
        </div>
        <div className="top-right">
          <Live lastAt={Math.max(agent.lastAt ?? 0, holders.lastAt ?? 0) || null} onRefresh={() => { agent.refresh(); holders.refresh(); }} />
          {operator && auth ? (
            <div className="whoami">
              <span className="muted">signed in as</span> <strong>{operator.name}</strong>{" "}
              <button className="linklike" onClick={() => { signOut(); window.location.reload(); }}>sign out</button>
            </div>
          ) : null}
          <div className="labels">
            <span className="label real">
              real · {config.readOnly ? "every number is read live from a Canton participant" : "ledger reads and the settle are live over the JSON Ledger API"}
            </span>
            <span className="label sim">simulated · the cash is TestTokenV2, the holders are synthetic</span>
            {config.distinctNodes === 1 ? (
              <span className="label sim">
                one participant · every party here is on the same node, so privacy is the ledger filtering by party
              </span>
            ) : config.distinctNodes && config.distinctNodes > 1 ? (
              <span className="label real">
                {config.distinctNodes} participants · each holder is on a node of its own
              </span>
            ) : null}
            {config.readOnly ? <span className="label">read only · this page cannot change the ledger</span> : null}
          </div>
        </div>
      </header>

      {agent.error ? <div className="error pad">{agent.error}</div> : null}

      {desk === "holders" ? (
        <div className="desk-page">
          {openHolder ? (
            <>
              <button className="linklike back" onClick={() => go("/holders")}>Back to the register</button>
              <HolderPage config={config} party={openHolder} book={book} />
            </>
          ) : (
            <HolderList config={config} book={book} onOpen={(p) => go("/holders/" + encodeURIComponent(p))} />
          )}
        </div>
      ) : null}
      {desk === "approvers" ? (
        <div className="desk-page">
          {openApprover ? (
            <>
              <button className="linklike back" onClick={() => go("/approvers")}>Back to the approvers</button>
              <ApproverPage config={config} committee={theCommittee} voting={approverVoting} node={openApprover} />
            </>
          ) : (
            <ApproverList
              config={config}
              committee={theCommittee}
              voting={approverVoting}
              onOpen={(n) => go("/approvers/" + encodeURIComponent(n))}
            />
          )}
        </div>
      ) : null}
      {desk === "issuer" ? (
        <div className="desk-page">
          <IssuerDesk
            config={config}
            issuers={issuerParties}
            seatIsin={seat.isin}
            tag={seat.tag}
            busy={agent.pressed.kind === "busy"}
            failure={agent.pressed.kind === "failed" && agent.pressed.what === "coupon" ? agent.pressed.reason : null}
            onAnnounce={agent.onAnnounce}
          />
        </div>
      ) : null}
      {desk === "holders" || desk === "approvers" || desk === "issuer" ? null : (
      <div className="with-rail">
      <RegisterRail book={book} picked={picked?.key ?? seat.runId} onPick={setPickedKey} />
      <div className="rail-main">
      <RunBar config={config} agent={agent} run={run} voting={voting} />

      {settled && state?.receipt ? (
        <div className="outcome ok">
          <div className="outcome-title">
            SETTLED · {state.receipt.legsSettled.toLocaleString("en-GB")} of {legs.toLocaleString("en-GB")} legs ·{" "}
            <Money amount={state.receipt.total} currency={currency} />
          </div>
          <div className="outcome-line">
            update id {state.receipt.updateId ? <CopyId value={state.receipt.updateId} chars={28} /> : <code>…</code>}
            {state.receipt.effectiveAt ? <span className="muted"> · effective {state.receipt.effectiveAt}</span> : null}
            {agent.pressed.kind === "settled" ? (
              <span className="muted"> · submitted to committed in {agent.pressed.ms.toLocaleString("en-GB")} ms</span>
            ) : null}
          </div>
        </div>
      ) : !settled && state?.proposal ? (
        <div className="outcome wait">
          <div className="outcome-title">
            AWAITING APPROVAL · {legs.toLocaleString("en-GB")} payments requested · 0 executed
          </div>
          <div className="outcome-line">
            {state.proposal.description}
            {state.run?.approver ? (
              <span className="muted">
                {" · "}
                {displayName(state.run.approver, config.seat.tag)}
                {/* Past tense once the threshold is met: the line directly below
                    already says it is, and the two together read as a
                    contradiction that makes an operator distrust the page. */}
                {voting.vote?.canExecute ? " confirmed to its threshold" : " must confirm to its threshold"}
              </span>
            ) : null}
          </div>
          {voting.vote ? (
            <div className="outcome-line">
              <strong>
                {voting.vote.confirmations} of {voting.vote.threshold}
              </strong>{" "}
              <span className="muted">
                {voting.vote.canExecute
                  ? "confirmed. The threshold is met and the settlement can execute."
                  : "confirmed. Each approver confirms on its own node; nothing moves until the threshold is met."}
              </span>
            </div>
          ) : voting.error ? (
            <div className="outcome-line muted">The vote could not be read: {voting.error}</div>
          ) : null}
          <Withdraw
            busy={agent.pressed.kind === "busy"}
            confirmations={voting.vote?.confirmations ?? 0}
            onWithdraw={agent.onWithdraw}
          />
        </div>
      ) : agent.pressed.kind === "rejected" ? (
        /* A refusal this operator just caused, by pressing settle. Loud, because
           it IS news: it happened a second ago and it is the atomicity
           guarantee being demonstrated. */
        <div className="outcome bad">
          <div className="outcome-title">
            SETTLEMENT REJECTED · {legs.toLocaleString("en-GB")} payments requested · 0 executed · NO PARTIAL SETTLEMENT
          </div>
          <div className="outcome-reason">{agent.pressed.reason}</div>
        </div>
      ) : state?.rejections.length && !settled ? (
        /* The same fact read back from the ledger rather than witnessed, and
           deliberately much quieter.

           `SettlementRejected` is never archived, so until 9 October the full
           red banner above sat on the page from the first refused press until
           that coupon settled. It survived a reload, which made a perfectly
           correct page look as though something had just gone wrong, and it
           made every clean pre-press shot of a coupon one-shot per seat.

           The fix is not to hide the contract. An agent whose last attempt
           failed has to know, and a page that forgot would be worse. What the
           page could not support was the urgency: it had no idea when the
           refusal happened. So it says when, and stops shouting. Same
           discipline as the cancelled-run wording, and the same fault as the
           stale approval button of 7 October. */
        <div className="outcome stale">
          <div className="outcome-line">
            <strong>The last attempt on this run was refused</strong>
            <span className="muted">· {whenRefused(state.rejections[0].attemptedAt)}</span>
            <span className="muted">
              · {state.rejections[0].legsRequested.toLocaleString("en-GB")} payments requested, none executed
            </span>
          </div>
          <div className="outcome-reason">{state.rejections[0].reason}</div>
        </div>
      ) : null}

      {/* The agent's panes. The issuer reaches none of this, and no longer by
          a guard here: its desk renders above, outside the rail layout
          entirely, so there is nothing left for a check to exclude. */}
      <Tabs
        active={tab}
        onPick={setTab}
        tabs={[
          { id: "holders", label: "Holders", count: rows.length },
          { id: "schedule", label: "Schedule", count: legs },
          { id: "privacy", label: "Privacy", count: `${byNode.size} nodes` },
          { id: "activity", label: "Activity", count: (state?.rejections.length ?? 0) + (settled ? 1 : 0) },
        ]}
      />

      <main className="work">
        {tab === "holders" ? <Holders config={config} holders={holders} rows={rows} run={run} /> : null}
        {tab === "schedule" ? (
          state?.schedule ? (
            <div className="schedule">
              <p className="grid-note">
                The entitlement schedule, as the executor sees it: every holder, every amount, and the state of each
                leg. Sort by any column. This is the one view in the page that one party alone is entitled to.
              </p>
              <p className="grid-note">
                Amounts are{" "}
                <strong>
                  {state.schedule.amountPerUnit.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 10 })}
                </strong>{" "}
                per unit, which is finer than a cent.{" "}
                {roundedUp + roundedDown > 0 ? (
                  <>
                    {roundedUp + roundedDown} of {entries.length} holders land between cents, so{" "}
                    <strong>{state.schedule.policy}</strong> rounds {roundedUp} up and {roundedDown} down, marked in the
                    table, and the parts still sum to the total exactly, with no cent invented or lost.
                  </>
                ) : (
                  <>Every holder lands on a whole cent here, so <strong>{state.schedule.policy}</strong> had nothing to do.</>
                )}
              </p>
              <LegTable
                currency={currency}
                rows={rows.map((r) => ({
                  who: r.name,
                  units: r.units,
                  amount: r.due,
                  status: r.status,
                  note: r.due > r.exact ? "rounded up" : r.due < r.exact ? "rounded down" : undefined,
                }))}
              />
            </div>
          ) : (
            <p className="muted pad">Reading the ledger…</p>
          )
        ) : null}
        {tab === "privacy" ? <Privacy config={config} currency={currency} byNode={byNode} isin={isin} runId={agent.runId} /> : null}
        {tab === "activity" ? <Activity agent={agent} run={run} /> : null}
      </main>
      </div>
      </div>
      )}

      <footer className="foot">
        seat <code>{seat.tag}</code> · run <code>{seat.runId}</code> · {seat.holders.length} holders ·{" "}
        {byNode.size} holding participants · network <code>{config.network}</code>
      </footer>
    </div>
  );
}

/** How fresh the figures are, and a way to ask again now. */
/**
 * How long since the last successful read, in units a person reads at a
 * glance. Seconds up to a minute, then m:ss - "400s ago" is a number you have
 * to divide, and this sits in the header of a page being filmed.
 */
function elapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}:${String(s).padStart(2, "0")}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Live({ lastAt, onRefresh }: { lastAt: number | null; onRefresh: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ago = lastAt ? Math.round((Date.now() - lastAt) / 1000) : null;
  const stale = ago != null && ago > 8;
  return (
    <button className="live" onClick={onRefresh} title="Read the ledger again now">
      <span className={`live-dot${stale ? " stale" : ""}`} />
      {ago == null ? "connecting" : ago <= 2 ? "live" : `${elapsed(ago)} ago`}
    </button>
  );
}
