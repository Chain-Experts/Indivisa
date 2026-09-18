import { Money } from "./Money";

export interface LegRow {
  who: string;
  units: number;
  amount: number;
  note?: string;
}

// The schedule as the paying agent sees it: every holder, every amount.
// A holder pane never renders this table with more than one row.
export function LegTable({ rows, currency, max = 12 }: { rows: LegRow[]; currency: string; max?: number }) {
  const shown = rows.slice(0, max);
  const rest = rows.length - shown.length;
  return (
    <table className="legs">
      <thead>
        <tr>
          <th>Holder</th>
          <th className="num">Units</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((r) => (
          <tr key={r.who}>
            <td>{r.who}{r.note ? <span className="note"> {r.note}</span> : null}</td>
            <td className="num">{r.units.toLocaleString("en-GB")}</td>
            <td className="num"><Money amount={r.amount} currency={currency} /></td>
          </tr>
        ))}
        {rest > 0 ? (
          <tr className="more">
            <td colSpan={3}>… and {rest.toLocaleString("en-GB")} more</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
