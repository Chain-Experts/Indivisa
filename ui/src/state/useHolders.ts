// Every holder, read from the node that hosts it.
//
// Holders are spread over several participants, so this polls one request
// set per node rather than one per holder: twenty cards cost twelve requests,
// two hundred and fifty cost the same twelve. Each node answers only for the
// holders it hosts, which is the whole point, and the per-party proof of
// that lives in `useNodeProbe` below.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ledger, type Party } from "../ledger/client";
import { holderState, nodeHolders, type HolderFacts, type HolderState } from "../ledger/queries";
import type { Config } from "../config";
import { POLL_MS } from "./useAgent";

/** party -> the participant that hosts it, and the holders grouped by node. */
export function groupByNode(config: Config, parties: Party[]): Map<string, Party[]> {
  const byNode = new Map<string, Party[]>();
  for (const p of parties) {
    const node = config.participantOf(p);
    const list = byNode.get(node);
    if (list) list.push(p);
    else byNode.set(node, [p]);
  }
  return byNode;
}

export interface HoldersHandle {
  facts: Map<Party, HolderFacts>;
  error: string | null;
  lastAt: number | null;
  refresh: () => Promise<void>;
}

/**
 * @param holders the register of the bond on screen, not the seat's fixed list:
 *                a second bond has holders of its own.
 */
export function useHolders(config: Config, currency: string, holders: Party[], isin: string, runId: string): HoldersHandle {
  const byNode = useMemo(() => groupByNode(config, holders), [config, holders]);

  const [facts, setFacts] = useState<Map<Party, HolderFacts>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const failures = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const perNode = await Promise.all(
        [...byNode.entries()].map(([node, parties]) => {
          // The connection acts as the first holder on the node and reads as
          // all of them; no paying-agent credential is involved.
          const ledger = new Ledger(config.baseOf(node), parties[0]);
          return nodeHolders(ledger, parties, runId, isin, currency);
        }),
      );
      const merged = new Map<Party, HolderFacts>();
      for (const m of perNode) for (const [k, v] of m) merged.set(k, v);
      setFacts(merged);
      setError(null);
      setLastAt(Date.now());
      failures.current = 0;
    } catch (e) {
      failures.current += 1;
      if (failures.current >= 2) setError(String(e));
    }
  }, [byNode, config, currency, isin, runId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return { facts, error, lastAt, refresh };
}

// ---------------------------------------------------------------------------
// The proof, one party at a time
// ---------------------------------------------------------------------------

export interface Probe {
  party: Party;
  node: string;
  state: HolderState | null;
  error: string | null;
  /** True while the node is answering, so a card can say it is asking. */
  busy: boolean;
}

/**
 * Ask one node, as one holder and nobody else, for everything it will hand
 * over: that holder's own contracts, and the count of everyone else's. This
 * is the privacy claim, run live rather than asserted, and it is deliberately
 * a separate read from the grid's.
 */
export function useNodeProbe(config: Config, currency: string, party: Party | null, live: boolean, isin: string, runId: string): Probe | null {
  const [probe, setProbe] = useState<Probe | null>(null);

  const run = useCallback(async () => {
    if (!party) return;
    const node = config.participantOf(party);
    setProbe((p) => (p && p.party === party ? { ...p, busy: true } : { party, node, state: null, error: null, busy: true }));
    try {
      const ledger = new Ledger(config.baseOf(node), party);
      const state = await holderState(ledger, runId, isin, currency);
      setProbe({ party, node, state, error: null, busy: false });
    } catch (e) {
      setProbe({ party, node, state: null, error: String(e), busy: false });
    }
  }, [config, currency, party, isin, runId]);

  useEffect(() => {
    if (!party) {
      setProbe(null);
      return;
    }
    run();
    if (!live) return;
    const t = setInterval(run, POLL_MS);
    return () => clearInterval(t);
  }, [party, live, run]);

  return probe;
}
