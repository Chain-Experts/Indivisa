import { useEffect, useMemo, useState } from "react";
import { displayName, loadConfig, type Config } from "./config";
import { Tabs } from "./components/Tabs";
import { Money } from "./components/Money";
import { CopyId } from "./components/CopyId";
import { LegTable, type LegStatus } from "./components/LegTable";
import { RunBar, type RunSummary } from "./panes/RunBar";
import { Holders, type HolderRow } from "./panes/Holders";
import { Privacy } from "./panes/Privacy";
import { Activity } from "./panes/Activity";
import { completeSignIn, currentOperator, resumeSession, signIn, signOut, type Operator, type OperatorAuth } from "./auth";
import { useAgent } from "./state/useAgent";
import { useVote } from "./state/useVote";
import { groupByNode, useHolders } from "./state/useHolders";

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
  useEffect(() => {
    fetch("/demo/participants.json")
      .then((r) => r.json())
      .then((m: { operator?: OperatorAuth | null }) => setAuth(m.operator ?? null))
      .catch((e) => setError(String(e)));
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

  if (error) return <div className="boot error">{error}</div>;
  if (!ready || auth === undefined) return <div className="boot">Starting…</div>;
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

function Console({ config, operator, auth }: { config: Config; operator: Operator | null; auth: OperatorAuth | null }) {
  const { seat } = config;
  const agent = useAgent(config);
  // The vote only exists while a proposal is outstanding, and only on a
  // network that has a Decentralization Manager configured.
  const voting = useVote(
    config.decmanParty,
    agent.state?.proposal?.cid ?? null,
    agent.ledgers.agent,
    agent.ledgers.registry,
    seat.rulesCid,
    agent.refresh,
  );
  const currency = agent.state?.instrument?.currency ?? "USD";
  const holders = useHolders(config, currency);
  const byNode = useMemo(() => groupByNode(config, seat.holders), [config, seat.holders]);
  const [tab, setTab] = useState("holders");

  const state = agent.state;
  const settled = state?.receipt != null;
  const legs = state?.run?.legs ?? state?.schedule?.entries.length ?? seat.legs;
  // The holders whose own receipt allocation is on the ledger. The send
  // allocation is the agent's own and has no holder, so it drops out.
  const authorised = useMemo(
    () => new Set((state?.allocations ?? []).filter((a) => !a.isSend).map((a) => a.authorizer).filter(Boolean) as string[]),
    [state?.allocations],
  );
  const statusOf = (party: string): LegStatus => (settled ? "paid" : authorised.has(party) ? "ready" : "waiting");

  const rows: HolderRow[] = useMemo(() => {
    const due = new Map<string, { units: number; amount: number; exact: number }>();
    for (const e of state?.schedule?.entries ?? [])
      due.set(e.holder, { units: Number(e.quantity), amount: Number(e.amount), exact: Number(e.exact) });
    return seat.holders.map((party) => {
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
  }, [config, holders.facts, seat.holders, seat.tag, state?.schedule, authorised, settled]);

  const missing = rows.filter((r) => r.status === "waiting").map((r) => r.name);
  // Straight from the schedule, not from the cards: these are the figures the
  // amounts were derived from.
  const entries = state?.schedule?.entries ?? [];
  const units = entries.reduce((s, e) => s + Number(e.quantity), 0);
  const exactTotal = entries.reduce((s, e) => s + Number(e.exact), 0);
  const roundedUp = entries.filter((e) => Number(e.amount) > Number(e.exact)).length;
  const roundedDown = entries.filter((e) => Number(e.amount) < Number(e.exact)).length;
  const run: RunSummary = {
    currency,
    legs,
    expectedAllocations: legs + 1,
    haveAllocations: state?.allocations.length ?? 0,
    authorised,
    missing,
    settled,
    units,
    exactTotal,
  };

  return (
    <div className="app">
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
              <span className="muted"> · {displayName(state.run.approver, config.seat.tag)} must confirm to its threshold</span>
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
        </div>
      ) : agent.pressed.kind === "rejected" || (state?.rejections.length && !settled) ? (
        <div className="outcome bad">
          <div className="outcome-title">
            SETTLEMENT REJECTED · {legs.toLocaleString("en-GB")} payments requested · 0 executed · NO PARTIAL SETTLEMENT
          </div>
          <div className="outcome-reason">
            {agent.pressed.kind === "rejected" ? agent.pressed.reason : state?.rejections[0]?.reason}
          </div>
        </div>
      ) : null}

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
                    <strong>{state.schedule.policy}</strong> rounds {roundedUp} up and {roundedDown} down — marked in the
                    table — and the parts still sum to the total exactly, with no cent invented or lost.
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
        {tab === "privacy" ? <Privacy config={config} currency={currency} byNode={byNode} /> : null}
        {tab === "activity" ? <Activity agent={agent} run={run} /> : null}
      </main>

      <footer className="foot">
        seat <code>{seat.tag}</code> · run <code>{seat.runId}</code> · {seat.holders.length} holders ·{" "}
        {byNode.size} holding participants · network <code>{config.network}</code>
      </footer>
    </div>
  );
}

/** How fresh the figures are, and a way to ask again now. */
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
      {ago == null ? "connecting" : ago <= 2 ? "live" : `${ago}s ago`}
    </button>
  );
}
