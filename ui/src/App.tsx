import { useEffect, useState } from "react";
import { loadConfig, type Config } from "./config";
import { PayingAgent } from "./panes/PayingAgent";
import { Holder } from "./panes/Holder";

// Four panes, four parties, four connections. No routing, no forms, no
// state library: each pane polls its own participant as its own party.
export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig).catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="boot error">{error}</div>;
  if (!config) return <div className="boot">Loading the seat…</div>;

  const holders = config.seat.holders.slice(0, 3);
  const currency = "USD";

  return (
    <div className="app">
      <header className="top">
        <div className="brand">Indivisa</div>
        <div className="tagline">Corporate actions, settled in one atomic batch, without exposing the register.</div>
        <div className="labels">
          <span className="label real">real · {config.readOnly ? "every number is read live from a Canton participant" : "ledger reads and the settle are live over the JSON Ledger API"}</span>
          <span className="label sim">simulated · the cash is TestTokenV2, the holders are synthetic</span>
          {config.readOnly ? <span className="label">read only · this page cannot change the ledger</span> : null}
        </div>
      </header>
      <main className="panes">
        <PayingAgent config={config} />
        {holders.map((h) => (
          <Holder key={h} config={config} party={h} currency={currency} />
        ))}
      </main>
      <footer className="foot">
        seat <code>{config.seat.tag}</code> · run <code>{config.seat.runId}</code> · {config.seat.holders.length} holders · network <code>{config.network}</code>
      </footer>
    </div>
  );
}
