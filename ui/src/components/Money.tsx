// Tabular figures, two decimals, currency code after. Numbers are the
// content of this UI; they must line up.
export function Money({ amount, currency }: { amount: number; currency: string }) {
  const s = amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span className="money">
      {s} <span className="ccy">{currency}</span>
    </span>
  );
}
