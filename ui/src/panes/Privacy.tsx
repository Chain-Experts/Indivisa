import { NodeAnswer } from "../components/NodeAnswer";
import { displayName, type Config } from "../config";
import { useNodeProbe } from "../state/useHolders";
import type { Party } from "../ledger/client";

/**
 * The claim, standing: for every participant that hosts holders, pick one of
 * its holders, ask that node as that holder alone, and count what comes back
 * about anyone else. It stays at zero while the batch settles, which is the
 * moment it would leak if it were going to.
 */
export function Privacy({ config, currency, byNode, isin, runId }: { config: Config; currency: string; isin: string; runId: string; byNode: Map<string, Party[]> }) {
  return (
    <div className="privacy">
      <p className="grid-note">
        One reading per participant, refreshed every two seconds. The paying agent is the executor and sees every leg,
        that is the standard's design, not a leak. What must not happen is a holder's node learning another holder's
        position, and these are the counts that would show it.
      </p>
      {config.distinctNodes === 1 ? (
        <p className="grid-note warn-note">
          On this network every participant name resolves to the <strong>same node</strong>, so what follows is the
          ledger declining to hand one party another party's contracts: real, and enforced by Canton, but weaker than
          the data never arriving. For that stronger claim the holders must sit on nodes somebody else operates; the
          local run does exactly that, with five participants.
        </p>
      ) : null}
      <div className="nodes">
        {[...byNode.entries()].map(([node, parties]) => (
          <NodeCard key={node} config={config} currency={currency} node={node} parties={parties} isin={isin} runId={runId} />
        ))}
      </div>
    </div>
  );
}

function NodeCard({
  config, currency, node, parties, isin, runId,
}: {
  config: Config; currency: string; node: string; parties: Party[]; isin: string; runId: string;
}) {
  // One holder speaks for the node: the answer is a property of what this
  // participant was sent, and every holder on it gets the same one. Any
  // individual holder can still be checked from its own card.
  const probe = useNodeProbe(config, currency, parties[0], true, isin, runId);
  return (
    <section className="node-card">
      <header className="node-head">
        <div>
          <div className="eyebrow">Participant</div>
          <h3><code>{node}</code></h3>
        </div>
        <div className="node-count">
          {parties.length} holder{parties.length === 1 ? "" : "s"}
        </div>
      </header>
      <div className="node-asked">
        asked as <strong>{displayName(parties[0], config.seat.tag)}</strong>
      </div>
      <NodeAnswer probe={probe} sharing={config.sharingWithAgent(node)} />
    </section>
  );
}
