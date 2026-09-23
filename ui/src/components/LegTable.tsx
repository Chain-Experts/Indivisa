import { useMemo, useState } from "react";
import { Money } from "./Money";

/** Where a holder's leg stands, read from the ledger, not assumed. */
export type LegStatus = "waiting" | "ready" | "paid";

export interface LegRow {
  who: string;
  units: number;
  amount: number;
  status?: LegStatus;
  note?: string;
}

const LABEL: Record<LegStatus, string> = {
  // No receipt allocation for this holder yet: the batch cannot settle.
  waiting: "waiting",
  // Authorised and funded; this leg is ready for the one transaction.
  ready: "ready",
  paid: "paid",
};

const ORDER: Record<LegStatus, number> = { waiting: 0, ready: 1, paid: 2 };

type Col = "who" | "units" | "amount" | "status";

// The schedule as the paying agent sees it: every holder, every amount, and
// whether that holder's leg is ready. All of them, in a scroll area, with
// sortable columns, because a register is something you interrogate.
export function LegTable({ rows, currency }: { rows: LegRow[]; currency: string }) {
  const [by, setBy] = useState<Col>("who");
  const [desc, setDesc] = useState(false);
  const hasStatus = rows.some((r) => r.status);

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      let d = 0;
      switch (by) {
        case "units": d = a.units - b.units; break;
        case "amount": d = a.amount - b.amount; break;
        case "status": d = ORDER[a.status ?? "ready"] - ORDER[b.status ?? "ready"]; break;
        default: d = a.who.localeCompare(b.who);
      }
      if (d === 0 && by !== "who") d = a.who.localeCompare(b.who);
      return desc ? -d : d;
    });
    return out;
  }, [rows, by, desc]);

  const pick = (col: Col) => {
    if (col === by) setDesc(!desc);
    else {
      setBy(col);
      // Names read best A to Z; figures read best largest first.
      setDesc(col === "units" || col === "amount");
    }
  };

  const waiting = rows.filter((r) => r.status === "waiting");
  // Name them. The waiting row can be anywhere in a schedule of hundreds, and
  // whoever is watching should not have to scroll to find out who is holding
  // the batch up.
  const names = waiting.slice(0, 3).map((r) => r.who).join(", ");
  const rest = waiting.length - Math.min(waiting.length, 3);

  return (
    <div className="legs-wrap">
      <table className="legs">
        <thead>
          <tr>
            <Th col="who" by={by} desc={desc} onPick={pick}>Holder</Th>
            <Th col="units" by={by} desc={desc} onPick={pick} num>Units</Th>
            <Th col="amount" by={by} desc={desc} onPick={pick} num>Amount</Th>
            {hasStatus ? <Th col="status" by={by} desc={desc} onPick={pick}>Leg</Th> : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.who} className={r.status === "waiting" ? "waiting" : undefined}>
              <td>{r.who}{r.note ? <span className="note"> {r.note}</span> : null}</td>
              <td className="num">{r.units.toLocaleString("en-GB")}</td>
              <td className="num"><Money amount={r.amount} currency={currency} /></td>
              {r.status ? <td><span className={`leg-status ${r.status}`}>{LABEL[r.status]}</span></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {waiting.length > 0 ? (
        <div className="legs-foot warn">
          <strong>{names}{rest > 0 ? ` and ${rest} more` : ""}</strong>{" "}
          {waiting.length === 1 ? "is not ready" : "are not ready"}: the batch settles all of them or none, so nothing
          moves until every leg is authorised.
        </div>
      ) : null}
    </div>
  );
}

function Th({
  col, by, desc, onPick, num, children,
}: {
  col: Col; by: Col; desc: boolean; onPick: (c: Col) => void; num?: boolean; children: React.ReactNode;
}) {
  const on = by === col;
  return (
    <th className={num ? "num" : undefined} aria-sort={on ? (desc ? "descending" : "ascending") : "none"}>
      <button className={`th-sort${on ? " on" : ""}`} onClick={() => onPick(col)}>
        {children}
        <span className="th-arrow">{on ? (desc ? "▾" : "▴") : ""}</span>
      </button>
    </th>
  );
}
