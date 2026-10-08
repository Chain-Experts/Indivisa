// The holder's own page, read from the holder's own node.
//
// Three pages, three desks, one deployment. A deployment has the paying agent,
// the issuer and each holder on separate systems at separate companies, each
// with its own login and its own ledger credential. This is one demo holding
// all of them, which is why you can open any holder's page without signing in,
// and every page says so rather than letting the separation imply more than
// it is.

import { useCallback, useEffect, useState } from "react";
import { Ledger, type Party } from "../ledger/client";
import { holderDesk, provideInstructions, type Coupon, type HolderDesk } from "../ledger/queries";
import { displayName, type Config } from "../config";
import { Money } from "../components/Money";

const POLL_MS = 2000;

/** Every holder on the register, across every bond. */
export function HolderList({
  config,
  book,
  onOpen,
}: {
  config: Config;
  book: Coupon[];
  onOpen: (party: Party) => void;
}) {
  const everyone = Array.from(new Set(book.flatMap((b) => b.holders))).sort((a, b) =>
    displayName(a, config.seat.tag) < displayName(b, config.seat.tag) ? -1 : 1,
  );
  // The book is one row per coupon, so a bond paying twice appears twice.
  // This column is about which bonds a holder owns, not how often they pay.
  const instruments = Array.from(new Map(book.map((b) => [b.isin, b])).values());
  return (
    <div className="holder-list">
      <div className="page-head">
        <h2>Holders</h2>
        <p>
          Everyone on the register, across every bond the paying agent keeps. Open one to see what that holder
          sees: their own positions, their own cash and their own settlement instructions, read from their own
          node and showing nothing about anybody else.
        </p>
      </div>
      {/* The whole row opens the holder, because that is what a row in a list
          of people is for. The name stays a real button so the keyboard and a
          screen reader get the same thing the mouse does. */}
      <table className="plain holders-table">
        <thead>
          <tr><th>Holder</th><th>Node</th><th>Bonds</th></tr>
        </thead>
        <tbody>
          {everyone.map((p) => {
            const held = instruments.filter((b) => b.holders.includes(p));
            return (
              <tr key={p} className="row-open" onClick={() => onOpen(p)}>
                <td>
                  <button className="rowlink" onClick={(e) => { e.stopPropagation(); onOpen(p); }}>
                    {displayName(p, config.seat.tag)}
                  </button>
                </td>
                <td className="num">{config.participantOf(p)}</td>
                <td>{held.map((b) => b.name).join(", ") || "none"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {everyone.length === 0 ? <p className="action-note">Reading the register…</p> : null}
    </div>
  );
}

/** One holder, and the one thing a holder ever does. */
export function HolderPage({ config, party, book }: { config: Config; party: Party; book: Coupon[] }) {
  const node = config.participantOf(party);
  const [desk, setDesk] = useState<HolderDesk | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const ledger = new Ledger(config.baseOf(node), party);

  const read = useCallback(async () => {
    try {
      setDesk(await holderDesk(new Ledger(config.baseOf(node), party)));
    } catch (e) {
      setFailure(String(e));
    }
  }, [config, node, party]);

  useEffect(() => {
    read();
    const t = setInterval(read, POLL_MS);
    return () => clearInterval(t);
  }, [read]);

  const provide = async () => {
    if (!desk?.request) return;
    setBusy(true);
    setFailure(null);
    try {
      await provideInstructions(ledger, desk.request.cid);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      read();
    }
  };

  const nameOf = (isin: string) => book.find((b) => b.isin === isin)?.name ?? isin;
  const currency = desk?.instructions[0]?.instrument ?? desk?.request?.instrument ?? "USD";

  return (
    <div className="holder-page">
      <div className="page-head">
        <h2>{displayName(party, config.seat.tag)}</h2>
        <p>
          Read from <strong>{node}</strong>, this holder's own participant, as this holder. Nothing on this page
          comes from the paying agent's node.
        </p>
      </div>

      <div className="holder-figures">
        <div className="fig">
          <div className="fig-label">Cash</div>
          <div className="fig-num"><Money amount={desk?.cash ?? 0} currency={currency} /></div>
          <div className="fig-sub">in this holder's own account</div>
        </div>
        <div className="fig">
          <div className="fig-label">Settlement instructions</div>
          <div className="fig-num">{desk ? (desk.instructions.length ? "on file" : "none") : "…"}</div>
          <div className="fig-sub">
            {desk?.instructions.length
              ? `the paying agent may credit this account in ${desk.instructions[0].instrument}`
              : "the paying agent cannot pay this holder"}
          </div>
        </div>
      </div>

      <h3 className="section-head">Holdings</h3>
      {desk?.positions.length ? (
        <table className="plain">
          <thead><tr><th>Bond</th><th>ISIN</th><th className="right">Units</th></tr></thead>
          <tbody>
            {desk.positions.map((p) => (
              <tr key={p.isin}>
                <td>{nameOf(p.isin)}</td>
                <td className="num">{p.isin}</td>
                <td className="num right">{p.quantity.toLocaleString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="action-note">{desk ? "Nothing on the register for this holder." : "Reading…"}</p>
      )}

      <h3 className="section-head">What this holder has to do</h3>
      {desk?.request ? (
        <div className="holder-action">
          <p>
            The paying agent has asked where to send this holder's money. Providing it is the only thing a holder
            ever does: it is given once and used for every payment afterwards, so no coupon after this one needs
            anything from them.
          </p>
          <button className="settle" disabled={busy} onClick={() => void provide()}>
            {busy ? "Sending…" : "Provide settlement instructions"}
          </button>
          {failure ? <p className="action-note warn">{failure}</p> : null}
        </div>
      ) : (
        <p className="action-note">
          {desk?.instructions.length
            ? "Nothing. Settlement instructions are already on file, so every coupon from here on lands without this holder doing anything."
            : "Nothing outstanding."}
        </p>
      )}

      <p className="action-note disclosure">
        <strong>There is no sign-in here, and in a deployment there would be.</strong> A holder would reach this
        through their own bank or broker, on their own node, with their own credential. This demo holds every
        party's credential in one place, which is why any holder's page opens without a password. What it does
        not do is let one holder see another: this page is read as this holder, from this holder's node, and the
        ledger answers accordingly.
      </p>
    </div>
  );
}
