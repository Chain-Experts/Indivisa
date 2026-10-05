import { Money } from "../components/Money";
import { CopyId } from "../components/CopyId";
import type { AgentHandle } from "../state/useAgent";
import type { RunSummary } from "./RunBar";

/**
 * What the ledger actually did, newest first: the settlement with its update
 * id, and every refusal with the reason the ledger gave. Both are contracts,
 * not log lines. The refusal is recorded on-ledger by the agent, which is
 * what makes "it was refused" auditable rather than a screenshot.
 */
export function Activity({ agent, run }: { agent: AgentHandle; run: RunSummary }) {
  const { state, pressed } = agent;
  const receipt = state?.receipt ?? null;
  const rejections = state?.rejections ?? [];

  if (!receipt && rejections.length === 0) {
    return (
      <p className="muted pad">
        Nothing has been attempted yet. Press the button and this fills in, with the settlement or with the ledger's
        reason for refusing it.
      </p>
    );
  }

  return (
    <ol className="events">
      {receipt ? (
        <li className="event ok">
          <div className="event-head">
            <span className="event-title">Settled</span>
            <span className="event-when">{receipt.effectiveAt ?? ""}</span>
          </div>
          <div className="event-body">
            <div className="event-figs">
              <Fig label="Legs">{receipt.legsSettled.toLocaleString("en-GB")} of {run.legs.toLocaleString("en-GB")}</Fig>
              <Fig label="Paid"><Money amount={receipt.total} currency={run.currency} /></Fig>
              <Fig label="Offset">{receipt.offset.toLocaleString("en-GB")}</Fig>
              {pressed.kind === "settled" ? <Fig label="Submit to commit">{pressed.ms.toLocaleString("en-GB")} ms</Fig> : null}
            </div>
            <div className="event-line">
              update id {receipt.updateId ? <CopyId value={receipt.updateId} chars={24} /> : <code>…</code>}
            </div>
            <div className="event-line muted">
              One transaction. Every leg in it, or none of them. There is no partial settlement to reconcile.
            </div>
          </div>
        </li>
      ) : null}

      {rejections.map((r) => (
        <li className="event bad" key={r.cid}>
          <div className="event-head">
            <span className="event-title">Refused</span>
            <span className="event-when">{r.attemptedAt}</span>
          </div>
          <div className="event-body">
            <div className="event-figs">
              <Fig label="Requested">{r.legsRequested.toLocaleString("en-GB")} payments</Fig>
              <Fig label="Executed">0</Fig>
              <Fig label="Record"><CopyId value={r.cid} chars={16} title={r.cid} /></Fig>
            </div>
            <pre className="event-reason">{r.reason}</pre>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Fig({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="event-fig">
      <div className="fig-label">{label}</div>
      <div className="fig-value">{children}</div>
    </div>
  );
}
