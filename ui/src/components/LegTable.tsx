import { useMemo, useState } from "react";
import { Money } from "./Money";

/**
 * Where a holder's leg stands, read from the ledger, not assumed.
 *
 * Four states, not two, and the reason is whose turn it is. A leg that is not
 * ready is held up by one of two different parties, and until 7 October both
 * read "waiting": on the governed path, where the seat stops before anything
 * is authorised, every card said WAITING and an operator could not tell the
 * holder who owes their bank details from the four payments the agent has
 * simply not authorised yet. The two are not the same problem, and nothing on
 * the agent's page can fix the first one.
 */
export type LegStatus = "blocked" | "unauthorised" | "ready" | "paid";

export interface LegRow {
  who: string;
  units: number;
  amount: number;
  status?: LegStatus;
  note?: string;
}

export const LABEL: Record<LegStatus, string> = {
  // The holder has given the agent no settlement instructions, so the agent
  // has nowhere to send the money. The holder's move, on the holder's page.
  blocked: "no details",
  // Instructions on file and the payment not authorised yet. The agent's move,
  // and it needs nothing from anybody else.
  unauthorised: "to authorise",
  // Authorised and funded; this leg is ready for the one transaction.
  ready: "ready",
  paid: "paid",
};

/** Worst first: sorting by state puts what holds the batch up at the top. */
const ORDER: Record<LegStatus, number> = { blocked: 0, unauthorised: 1, ready: 2, paid: 3 };

/** Whose move it is, for the counts beside the button. */
export const TURN: Record<LegStatus, string> = {
  blocked: "waiting on the holder",
  unauthorised: "to authorise",
  ready: "ready",
  paid: "paid",
};

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

  // Name them. The row that is not ready can be anywhere in a schedule of
  // hundreds, and whoever is watching should not have to scroll to find out
  // who is holding the batch up. Split by whose move it is: one of these is
  // fixed on the agent's own screen and the other is not.
  const blocked = rows.filter((r) => r.status === "blocked");
  const toAuthorise = rows.filter((r) => r.status === "unauthorised");
  const name3 = (rs: LegRow[]) =>
    rs.slice(0, 3).map((r) => r.who).join(", ") + (rs.length > 3 ? " and " + (rs.length - 3) + " more" : "");

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
            <tr key={r.who} className={r.status === "blocked" ? "blocked" : undefined}>
              <td>{r.who}{r.note ? <span className="note"> {r.note}</span> : null}</td>
              <td className="num">{r.units.toLocaleString("en-GB")}</td>
              <td className="num"><Money amount={r.amount} currency={currency} /></td>
              {r.status ? <td><span className={`leg-status ${r.status}`}>{LABEL[r.status]}</span></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {blocked.length > 0 || toAuthorise.length > 0 ? (
        <div className="legs-foots">
      {blocked.length > 0 ? (
        <div className="legs-foot warn">
          <strong>{name3(blocked)}</strong> {blocked.length === 1 ? "has" : "have"} given no settlement
          instructions, so the paying agent has nowhere to send that money. The batch settles all of them or
          none, so nothing moves until every holder's details are on file.
        </div>
      ) : null}
      {toAuthorise.length > 0 ? (
        <div className="legs-foot">
          <strong>{name3(toAuthorise)}</strong> {toAuthorise.length === 1 ? "is" : "are"} not authorised yet.
          The agent does that alone, under the instructions those holders gave once.
        </div>
      ) : null}
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
