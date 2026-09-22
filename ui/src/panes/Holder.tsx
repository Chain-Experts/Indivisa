import { useCallback, useEffect, useRef, useState } from "react";
import { Ledger } from "../ledger/client";
import { holderState, type HolderState } from "../ledger/queries";
import { displayName, shortId, type Config } from "../config";
import { Money } from "../components/Money";
import { StatusPill } from "../components/StatusPill";

const POLL_MS = 2000;

// One component, rendered once per holder. It reads that holder's own
// participant as that holder. The lower half is the demo: what this node
// holds about anyone else, which is nothing.
export function Holder({ config, party, currency }: { config: Config; party: string; currency: string }) {
  const { seat } = config;
  const participant = config.participantOf(party);
  const ledger = new Ledger(config.baseOf(participant), party);

  const [state, setState] = useState<HolderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const failures = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setState(await holderState(ledger, seat.runId, seat.isin, currency));
      setError(null);
      failures.current = 0;
    } catch (e) {
      // One failed poll is noise (the dev proxy, a busy node); two in a row is worth showing.
      failures.current += 1;
      if (failures.current >= 2) setError(String(e));
    }
  }, [party, seat.runId, seat.isin, currency]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const paid = (state?.cash ?? 0) > 0;
  const othersTotal = state ? Object.values(state.others).reduce((s, n) => s + n, 0) : 0;
  // On LocalNet each holder has its own node and the zeros mean the data never
  // arrived. On a network where this holder shares the agent's node (one
  // validator, or BitSafe's sandbox) the node does hold it; the ledger filters
  // it by party. Say which, or the pane overclaims.
  const sharesAgentNode = participant === config.participantOf(seat.payingAgent);

  return (
    <section className="pane pane-holder">
      <header className="pane-head">
        <div>
          <div className="eyebrow">Holder · sees its own leg only</div>
          <h2>{displayName(party, seat.tag)}</h2>
          <div className="sub">participant <code>{participant}</code> · party <code>{shortId(party.split("::")[1] ?? "", 12)}</code></div>
        </div>
        {paid ? <StatusPill tone="ok">paid</StatusPill>
          : state?.myAllocation ? <StatusPill tone="ready">allocated</StatusPill>
          : state?.agreement ? <StatusPill tone="neutral">onboarded</StatusPill>
          : <StatusPill tone="neutral">—</StatusPill>}
      </header>

      {error ? <div className="error">{error}</div> : null}

      <dl className="facts">
        <dt>My position</dt><dd>{state ? `${state.positions.toLocaleString("en-GB")} units` : "…"}</dd>
        <dt>My agreement</dt><dd>{state ? (state.agreement ? "signed once, at onboarding" : "none") : "…"}</dd>
        <dt>My allocation</dt>
        <dd>{state?.myAllocation ? <Money amount={state.myAllocation.amount} currency={currency} /> : <span className="muted">none for this run</span>}</dd>
        <dt>My cash</dt>
        <dd className={paid ? "big" : ""}>
          {state ? <Money amount={state.cash} currency={currency} /> : "…"}
          {state && state.cashContracts > 0 ? <span className="muted"> · {state.cashContracts} holding{state.cashContracts === 1 ? "" : "s"}</span> : null}
        </dd>
      </dl>

      <h3>What this node holds about other holders</h3>
      {state ? (
        <ul className="others">
          <li><span className="count">{state.others.positions}</span> other holders' positions</li>
          <li><span className="count">{state.others.holdings}</span> other holders' cash holdings</li>
          <li><span className="count">{state.others.allocations}</span> other holders' allocations</li>
          <li><span className="count">{state.others.schedules}</span> entitlement schedules</li>
          <li><span className="count">{state.others.runs}</span> distribution runs</li>
          <li><span className="count">{state.others.rejections}</span> rejection records</li>
        </ul>
      ) : null}
      <div className={`nothing ${othersTotal === 0 ? "" : "leak"}`}>
        {state
          ? othersTotal !== 0 ? `${othersTotal} contracts about others reached this node`
            : sharesAgentNode ? "Nothing for this party. This node also hosts the paying agent, so the data is on the node; the ledger filters it by party."
            : "Nothing. Not hidden — never received by this participant."
          : ""}
      </div>
    </section>
  );
}
