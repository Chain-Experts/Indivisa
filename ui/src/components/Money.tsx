// Tabular figures, two decimals, currency code after. Numbers are the
// content of this UI; they must line up.
export function Money({ amount, currency, maxDecimals = 2 }: { amount: number; currency: string; maxDecimals?: number }) {
  const s = amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals });
  return (
    <span className="money">
      {s} <span className="ccy">{currency}</span>
    </span>
  );
}
