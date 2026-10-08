// The approvers' desk, and the one place in this application that deliberately
// sends you somewhere else.
//
// A member of a decentralised party confirms in **its own** Decentralization
// Manager, on its own node. This desk therefore tells you who the approvers
// are, where each one stands on the request in front of them, and links each
// to the software it answers in.
//
// **It also confirms, and that was not the first plan.** The intent was a read
// page and a link: a Confirm button in the paying agent's own console looks
// like the agent casting the approvers' votes, which would hollow out the only
// claim the governed path makes. Then the fact checked out differently.
// Decentralization Manager v1.8.0 does not surface a **custom domain action**
// in its Approvals view at all - measured 8 October, node 1's own API
// reporting our pending proposal while its own UI read "Needs you 0" - so the
// link cannot act and the alternative was leaving a terminal command in the
// middle of the demo.
//
// What makes the button defensible is what it actually does: it posts to
// `/decman/<node>/`, which is THAT member's own node, and the confirmation is
// a contract that member signs. `docker compose run --rm govern confirm 1` is
// the same POST from a script we also wrote. In a demo that deliberately holds
// every party's credential, a button is no weaker than a shell command, and
// the guarantee being shown lives on the ledger: the threshold is enforced by
// the governance rules and an execute below it is refused by Canton, whoever
// pressed what.
//
// It exists only where `approverNodes` is published, which is the judges'
// local stack. A real deployment has no route to another company's node, so
// the button is simply absent - and the page says so rather than leaving a
// judge to work it out.

import { useState } from "react";
import type { Config } from "../config";
import type { Party } from "../ledger/client";
import { confirmAs, type Committee } from "../ledger/decman";
import type { VoteHandle } from "../state/useVote";

/** A member, and whether it has acted on the request in front of it. */
interface Seat {
  node: string;
  member: Party;
  url: string;
  confirmed: boolean;
}

function seats(config: Config, voting?: VoteHandle): Seat[] {
  const done = new Set(voting?.vote?.confirmedBy ?? []);
  return config.approverNodes.map((n) => ({ ...n, confirmed: done.has(n.member) }));
}

/** Party ids carry a 68-character fingerprint; the hint is the readable half,
 *  and it is itself a UUID where the manager allocated the party rather than
 *  being given a name. */
const hint = (p: string) => {
  const h = p.split("::")[0];
  return h.length > 24 ? h.slice(0, 12) + "…" : h;
};

export function ApproverList({
  config,
  committee,
  voting,
  onOpen,
}: {
  config: Config;
  committee: Committee | null;
  voting?: VoteHandle;
  onOpen: (node: string) => void;
}) {
  const rows = seats(config, voting);
  const vote = voting?.vote ?? null;

  if (!config.decmanParty) {
    return (
      <div className="desk-page">
        <div className="page-head">
          <h2>Approvers</h2>
          <p>
            This deployment has no decentralised party, so every run is released by the paying agent alone. That
            is the main product: a coupon that needs more than one company to agree is the option, not the
            default.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="desk-page">
      <div className="page-head">
        <h2>Approvers</h2>
        <p>
          <strong>{hint(config.decmanParty)}</strong> is a decentralised party: a party on the ledger that no
          single company controls, made of the members below. A run that names it as a second executor cannot be
          settled by the paying agent alone, however much authority the agent has over its own systems.
          {committee ? (
            <>
              {" "}
              <strong>
                {committee.threshold} of {committee.members.length}
              </strong>{" "}
              must confirm, read from the party's own governance rules.
            </>
          ) : null}
        </p>
      </div>

      {vote ? (
        <div className={`vote-strip${vote.canExecute ? " done" : ""}`}>
          <strong>
            {vote.confirmations} of {vote.threshold} confirmed
          </strong>{" "}
          {vote.canExecute
            ? "on the request in front of them. The threshold is met, so the paying agent can now execute the settlement with their authority and its own together."
            : "on the request in front of them. Nothing moves until the threshold is met."}
        </div>
      ) : (
        <p className="action-note">
          Nothing is waiting on the approvers. A request appears here when the paying agent asks them to release
          a run, which it does from its own desk.
        </p>
      )}

      <table className="plain holders-table">
        <thead>
          <tr><th>Member</th><th>Node</th><th>Its own manager</th><th>This request</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.node} className="row-open" onClick={() => onOpen(r.node)}>
              <td>
                <button className="rowlink" onClick={(e) => { e.stopPropagation(); onOpen(r.node); }}>
                  Member on node {r.node}
                </button>
              </td>
              <td className="num">{hint(r.member)}</td>
              <td className="num">{r.url.replace(/^https?:\/\//, "")}</td>
              <td>
                {!vote ? (
                  <span className="muted">nothing to act on</span>
                ) : r.confirmed ? (
                  <span className="leg-status ready">confirmed</span>
                ) : (
                  <span className="leg-status unauthorised">not yet</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="action-note">Reading the approvers…</p> : null}

      <p className="action-note disclosure">
        <strong>Open a member to confirm as that member, and read the note there.</strong> In a deployment each
        of these is a different company, confirming in its own application behind its own sign-in, and this
        console would have no route to any of them. On this stack all three nodes run on one machine and hold
        their own credentials here, which is why you can act as each in turn. What that cannot get around is the
        rule: the governance rules enforce the threshold on the ledger, and a settlement below it is refused by
        Canton.
      </p>
    </div>
  );
}

export function ApproverPage({
  config,
  committee,
  voting,
  node,
}: {
  config: Config;
  committee: Committee | null;
  voting?: VoteHandle;
  node: string;
}) {
  const seat = seats(config, voting).find((s) => s.node === node) ?? null;
  const vote = voting?.vote ?? null;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const confirm = async () => {
    if (!config.decmanParty || !vote || !voting?.proposalCid) return;
    setBusy(true);
    setFailure(null);
    try {
      await confirmAs(node, config.decmanParty, vote.rulesCid, voting.proposalCid);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!seat) {
    return (
      <div className="desk-page">
        <div className="page-head">
          <h2>Approver</h2>
          <p>No approver node by that name in this deployment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="desk-page">
      <div className="page-head">
        <h2>Member on node {seat.node}</h2>
        <p>
          One of the {committee ? committee.members.length : "three"} members of{" "}
          <strong>{config.decmanParty ? hint(config.decmanParty) : "the approvers"}</strong>. It holds one
          confirmation and no more: it cannot release a payment on its own, and it cannot stop the others
          reaching their threshold without it.
        </p>
      </div>

      <div className="holder-figures">
        <div className="fig">
          <div className="fig-label">This request</div>
          <div className="fig-num">{!vote ? "—" : seat.confirmed ? "confirmed" : "not yet"}</div>
          <div className="fig-sub">
            {!vote
              ? "nothing is waiting on the approvers"
              : seat.confirmed
                ? "this member has confirmed on its own node"
                : "this member has not confirmed yet"}
          </div>
        </div>
        <div className="fig">
          <div className="fig-label">The vote</div>
          <div className="fig-num">{vote ? `${vote.confirmations} of ${vote.threshold}` : "—"}</div>
          <div className="fig-sub">
            {vote?.canExecute ? "the threshold is met" : vote ? "below the threshold, so nothing moves" : "no request outstanding"}
          </div>
        </div>
      </div>

      <h3 className="section-head">Its member party</h3>
      <p className="action-note">
        <code className="approver-id">{seat.member}</code>
      </p>

      <h3 className="section-head">What this member does</h3>
      <div className="holder-action">
        <p>
          It confirms, or declines to. The confirmation is a contract <strong>this member</strong> signs on its
          own node, and nothing the paying agent holds can write it: that is what makes the run need more than
          one company. Confirming is all a member does, and it is enough, because the governance rules will not
          release the settlement until the threshold is reached.
        </p>
        {vote && !seat.confirmed ? (
          <button className="settle" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Confirming…" : "Confirm this payment, as this member"}
          </button>
        ) : vote ? (
          <p className="action-note">
            This member has confirmed. {vote.canExecute
              ? "The threshold is met, so the paying agent can now execute the settlement."
              : "The run still needs another member before anything can move."}
          </p>
        ) : (
          <p className="action-note">Nothing is waiting on this member.</p>
        )}
        {failure ? <p className="action-note warn">{failure}</p> : null}
        <p className="action-note">
          Or do it in this member's own software: <a href={seat.url} target="_blank" rel="noreferrer">{seat.url}</a>,
          which is BitSafe's Decentralization Manager running on this node. Note that v1.8.0 does not list a
          custom proposal like ours under its Approvals view, which is why the button above exists at all and is
          a finding we owe them.
        </p>
      </div>

      <p className="action-note disclosure">
        <strong>That button would not exist in a deployment, and this is the one page where that matters most.</strong>{" "}
        A member confirms in its own application, at its own company, behind its own sign-in, and the paying
        agent's console would have no route to it. It is here because this demo holds every party's credential
        and because the alternative was a terminal command in the middle of the demonstration. What is not
        theatre is the rule it cannot get around: the threshold is enforced by the governance rules on the
        ledger, and an execute below it is refused by Canton no matter who pressed what. On the DevNet run the
        second confirmation came from BitSafe, on BitSafe's own node, and we could not have produced it.
      </p>
      <p className="action-note disclosure">
        <strong>Executing is the paying agent's step, not this one.</strong> Once the threshold is met the
        settlement is exercised with the members' authority and the agent's together, and it needs contracts only
        the agent's node holds, so the agent's own desk is where that button lives. A member's job is to agree or
        not.
      </p>
    </div>
  );
}
