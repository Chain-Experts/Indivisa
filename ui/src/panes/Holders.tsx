import { useEffect, useMemo, useState } from "react";
import { Money } from "../components/Money";
import { StatusPill } from "../components/StatusPill";
import { NodeAnswer } from "../components/NodeAnswer";
import { CopyId } from "../components/CopyId";
import type { Config } from "../config";
import type { Party } from "../ledger/client";
import type { HolderFacts } from "../ledger/queries";
import { useNodeProbe, type HoldersHandle } from "../state/useHolders";
import type { LegStatus } from "../components/LegTable";
import type { RunSummary } from "./RunBar";

export interface HolderRow {
  party: Party;
  name: string;
  node: string;
  units: number;
  due: number;
  /** The entitlement before rounding to the cent; `due` is what is paid. */
  exact: number;
  facts: HolderFacts | undefined;
  status: LegStatus;
}

type SortKey = "name" | "due" | "units" | "status";

const FILTERS: { id: "all" | LegStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "ready", label: "Ready" },
  { id: "paid", label: "Paid" },
];

/**
 * One card per holder, however many there are, each filled from the node
 * that hosts that holder. Click one and the page asks that node, as that
 * holder and nobody else, what it will hand over.
 */
export function Holders({
  config,
  holders,
  rows,
  run,
}: {
  config: Config;
  holders: HoldersHandle;
  rows: HolderRow[];
  run: RunSummary;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | LegStatus>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [selected, setSelected] = useState<Party | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) => (filter === "all" || r.status === filter) && (q === "" || r.name.toLowerCase().includes(q)));
    const order: Record<LegStatus, number> = { waiting: 0, ready: 1, paid: 2 };
    out.sort((a, b) => {
      switch (sort) {
        case "due": return b.due - a.due;
        case "units": return b.units - a.units;
        case "status": return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
        default: return a.name.localeCompare(b.name);
      }
    });
    return out;
  }, [rows, query, filter, sort]);

  const counts = useMemo(() => {
    const c = { waiting: 0, ready: 0, paid: 0 } as Record<LegStatus, number>;
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <div className={`holders${selected ? " with-drawer" : ""}`}>
      <div className="toolbar">
        <input
          id="holder-search"
          className="search"
          type="search"
          placeholder={`Search ${rows.length} holders`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search holders by name"
        />
        <div className="chips" role="group" aria-label="Filter by leg state">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`chip${filter === f.id ? " on" : ""}${f.id !== "all" ? ` chip-${f.id}` : ""}`}
              onClick={() => setFilter(f.id)}
              disabled={f.id !== "all" && counts[f.id as LegStatus] === 0}
            >
              {f.label}
              <span className="chip-count">{f.id === "all" ? rows.length : counts[f.id as LegStatus]}</span>
            </button>
          ))}
        </div>
        <label className="sort">
          Sort
          <select id="holder-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="name">name</option>
            <option value="due">amount due</option>
            <option value="units">units held</option>
            <option value="status">leg state</option>
          </select>
        </label>
      </div>

      <p className="grid-note">
        Every holder has a card, and each one is read from the participant that hosts that holder, never from the
        paying agent's node. This console is a demo harness and holds every party's credential, which is exactly why
        the check is worth running: open any card and the node still answers for that holder and nobody else.
      </p>

      {holders.error ? <div className="error">{holders.error}</div> : null}

      <div className="cards">
        {shown.map((r) => (
          <button
            key={r.party}
            className={`hcard st-${r.status}${selected === r.party ? " on" : ""}`}
            onClick={() => setSelected(r.party === selected ? null : r.party)}
            aria-expanded={selected === r.party}
          >
            <span className="hcard-top">
              <span className="hcard-name">{r.name}</span>
              <StatusPill tone={r.status === "paid" ? "ok" : r.status === "ready" ? "ready" : "bad"}>{r.status}</StatusPill>
            </span>
            <span className="hcard-node">
              <code>{r.node}</code>
            </span>
            <span className="hcard-figs">
              <span className="fig">
                <span className="fig-label">Units</span>
                <span className="fig-value">{r.units.toLocaleString("en-GB")}</span>
              </span>
              <span className="fig">
                <span className="fig-label">Due</span>
                <span className="fig-value"><Money amount={r.due} currency={run.currency} /></span>
              </span>
              <span className="fig">
                <span className="fig-label">Cash</span>
                <span className={`fig-value${(r.facts?.cash ?? 0) > 0 ? " paid" : ""}`}>
                  <Money amount={r.facts?.cash ?? 0} currency={run.currency} />
                </span>
              </span>
            </span>
            <span className="hcard-foot">
              <span className="hcard-facts">
                {r.facts?.agreement ? "agreement signed" : "no agreement"} ·{" "}
                {r.status === "paid"
                  ? "allocation consumed"
                  : r.facts?.allocated != null
                    ? "allocation on ledger"
                    : "awaiting allocation"}
              </span>
              <span className="hcard-open">{selected === r.party ? "close" : "inspect node"}</span>
            </span>
          </button>
        ))}
        {shown.length === 0 ? <p className="muted">No holder matches.</p> : null}
      </div>

      {selected ? (
        <HolderDrawer
          config={config}
          run={run}
          row={rows.find((r) => r.party === selected)!}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function HolderDrawer({ config, run, row, onClose }: { config: Config; run: RunSummary; row: HolderRow; onClose: () => void }) {
  const probe = useNodeProbe(config, run.currency, row.party, true);
  // Read from the ledger, not inferred from the names in the config.
  const sharing = config.sharingWithAgent(row.node);

  return (
    <aside className="drawer" role="dialog" aria-label={`${row.name}, as its own participant sees it`}>
      <header className="drawer-head">
        <div>
          <div className="eyebrow">Holder · sees its own leg only</div>
          <h2>{row.name}</h2>
          <div className="sub">
            participant <code>{row.node}</code> · party <CopyId value={row.party} chars={14} />
          </div>
        </div>
        <button className="drawer-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <dl className="facts">
        <dt>My position</dt>
        <dd>{row.units.toLocaleString("en-GB")} units</dd>
        <dt>My agreement</dt>
        <dd>{row.facts?.agreement ? "signed once, at onboarding" : <span className="warn">none, this holder cannot be paid</span>}</dd>
        <dt>My entitlement</dt>
        <dd><Money amount={row.due} currency={run.currency} /></dd>
        <dt>My allocation</dt>
        <dd>
          {row.facts?.allocated != null ? (
            <Money amount={row.facts.allocated} currency={run.currency} />
          ) : row.status === "paid" ? (
            <span className="muted">consumed by the settlement</span>
          ) : (
            <span className="muted">none for this run</span>
          )}
        </dd>
        <dt>My cash</dt>
        <dd className={(row.facts?.cash ?? 0) > 0 ? "big" : ""}>
          <Money amount={row.facts?.cash ?? 0} currency={run.currency} />
          {row.facts && row.facts.cashContracts > 0 ? (
            <span className="muted"> · {row.facts.cashContracts} holding{row.facts.cashContracts === 1 ? "" : "s"}</span>
          ) : null}
        </dd>
      </dl>

      <h3>What this node holds about other holders</h3>
      <NodeAnswer probe={probe} sharing={sharing} />
    </aside>
  );
}
