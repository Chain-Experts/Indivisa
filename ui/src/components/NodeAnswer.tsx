import type { NodeSharing } from "../config";
import type { HolderState } from "../ledger/queries";
import type { Probe } from "../state/useHolders";

const ROWS: { key: keyof HolderState["others"]; label: string }[] = [
  { key: "positions", label: "other holders' positions" },
  { key: "holdings", label: "other holders' cash holdings" },
  { key: "allocations", label: "other holders' allocations" },
  { key: "schedules", label: "entitlement schedules" },
  { key: "runs", label: "distribution runs" },
  { key: "rejections", label: "rejection records" },
];

/**
 * What one node hands over when one holder asks it. Six counts, read live,
 * and they are the demo: not a filtered view of data the node has, but data
 * the node was never sent.
 */
export function NodeAnswer({ probe, sharing }: { probe: Probe | null; sharing: NodeSharing }) {
  if (!probe) return null;
  if (probe.error) return <div className="error">{probe.error}</div>;
  const s = probe.state;
  if (!s) return <div className="probe-wait">Asking <code>{probe.node}</code>…</div>;

  const total = Object.values(s.others).reduce((a, b) => a + b, 0);
  return (
    <div className="node-answer">
      <div className="probe-head">
        <span className="probe-label">
          read as this holder alone, from <code>{probe.node}</code>
        </span>
        {probe.busy ? <span className="probe-dot busy" aria-label="reading" /> : <span className="probe-dot" aria-label="current" />}
      </div>
      <ul className="others">
        {ROWS.map((r) => (
          <li key={r.key}>
            <span className={`count${s.others[r.key] === 0 ? " zero" : " leak"}`}>{s.others[r.key]}</span> {r.label}
          </li>
        ))}
      </ul>
      <div className={`nothing ${total === 0 ? "" : "leak"}`}>
        {total !== 0
          ? `${total} contracts about others reached this node`
          : sharing === "separate"
            ? "Nothing. Not hidden. Never received by this participant."
            : sharing === "shared"
              ? "Nothing for this party. This node also hosts the paying agent, so the data is on the node and the ledger filters it by party: a weaker guarantee than never receiving it, and the one this network can offer."
              : "Nothing for this party. This deployment would not say which node answered, so we do not claim the data never arrived."}
      </div>
    </div>
  );
}
