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
import { useAgent } from "./state/useAgent";
import { groupByNode, useHolders } from "./state/useHolders";

// The console: one working header, one command, and four ways of looking at
// the same run. Every figure is read from the participant that holds it;
// there is no application backend and nothing is cached between views.
export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="boot error">{error}</div>;
  if (!config) return <div className="boot">Loading the seat…</div>;
  return <Console config={config} />;
}

function Console({ config }: { config: Config }) {
  const { seat } = config;
  const agent = useAgent(config);
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
    const due = new Map<string, { units: number; amount: number }>();
    for (const e of state?.schedule?.entries ?? []) due.set(e.holder, { units: Number(e.quantity), amount: Number(e.amount) });
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
        facts,
        status: statusOf(party),
      };
    });
  }, [config, holders.facts, seat.holders, seat.tag, state?.schedule, authorised, settled]);

  const missing = rows.filter((r) => r.status === "waiting").map((r) => r.name);
  const run: RunSummary = {
    currency,
    legs,
    expectedAllocations: legs + 1,
    haveAllocations: state?.allocations.length ?? 0,
    authorised,
    missing,
    settled,
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <img className="logo" src="/indivisa-logo.png" alt="" width={44} height={44} />
          <div className="brand-text">
            <div className="wordmark">Indivisa</div>
            <div className="tagline">Corporate actions, settled in one atomic batch, without exposing the register.</div>
          </div>
        </div>
        <div className="top-right">
          <Live lastAt={Math.max(agent.lastAt ?? 0, holders.lastAt ?? 0) || null} onRefresh={() => { agent.refresh(); holders.refresh(); }} />
          <div className="labels">
            <span className="label real">
              real · {config.readOnly ? "every number is read live from a Canton participant" : "ledger reads and the settle are live over the JSON Ledger API"}
            </span>
            <span className="label sim">simulated · the cash is TestTokenV2, the holders are synthetic</span>
            {config.readOnly ? <span className="label">read only · this page cannot change the ledger</span> : null}
          </div>
        </div>
      </header>

      {agent.error ? <div className="error pad">{agent.error}</div> : null}

      <RunBar config={config} agent={agent} run={run} />

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
              <LegTable
                currency={currency}
                rows={rows.map((r) => ({ who: r.name, units: r.units, amount: r.due, status: r.status }))}
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
