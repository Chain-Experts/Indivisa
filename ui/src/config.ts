// What the panes need to know before they read the ledger: which parties to
// show and which participant hosts each. Both come from files the demo
// scripts wrote (served by the dev server; see vite.config.ts).

import { Ledger, type Party } from "./ledger/client";

/** The seat, as Indivisa.Test.Demo.demo_seat emitted it (JSON of DemoSeat). */
export interface Seat {
  tag: string;
  registry: Party;
  issuer: Party;
  payingAgent: Party;
  holders: Party[];
  rulesCid: string;
  scheduleCid: string;
  isin: string;
  runId: string;
  legs: number;
  total: string;
}

/** What the dev server serves at /demo/participants.json: the map only, never the tokens. */
export interface ParticipantMap {
  network: string;
  party_participants: Record<Party, string>;
  // A deployment whose proxy allows reads only (the public one for judges).
  // The settle button is hidden rather than left to fail on a refused POST.
  readOnly?: boolean;
  // The decentralised party whose members approve a governed run, when this
  // network has one. The party id only: the token that reaches its
  // Decentralization Manager stays on the server.
  decman?: { party: Party; nodes?: { node: string; member: Party; url: string }[] } | null;
  // The ledger user to submit as, from the participant map. Null on an
  // unauthenticated network, where the default name does.
  userId?: string | null;
  // Where operators sign in, when this deployment requires it.
  operator?: { issuer: string; clientId: string } | null;
}

/**
 * Whether a holder's node is a different machine from the paying agent's.
 * It decides what the page is allowed to say about the zeros, so it is read
 * from the ledger and never inferred from the config's names: a network may
 * point every participant name at one validator, and then "never delivered"
 * would be false.
 */
export type NodeSharing = "separate" | "shared" | "unknown";

export interface Config {
  network: string;
  readOnly: boolean;
  seat: Seat;
  /** participant name -> proxied base URL */
  baseOf: (participant: string) => string;
  /** party -> participant name */
  participantOf: (party: Party) => string;
  /** participant name -> the id the node reports for itself, where it answered */
  nodeIdOf: (participant: string) => string | null;
  /** How this participant relates to the one hosting the paying agent. */
  sharingWithAgent: (participant: string) => NodeSharing;
  /** Distinct nodes behind the participant names, or null if they could not be read. */
  distinctNodes: number | null;
  /** The approvers' party, when a Decentralization Manager is configured. */
  decmanParty: Party | null;
  /** One per approver node: its member party, and where a browser reaches that
   *  node's own Decentralization Manager. Empty where none is configured.
   *
   *  The URL is published by `govern.sh` rather than derived here, because a
   *  browser reaches those nodes on host-published ports while the scripts
   *  reach them on container hostnames, and only the deployment knows both. */
  approverNodes: { node: string; member: Party; url: string }[];
  /** Where operators sign in, or null on an unauthenticated deployment. */
  operatorAuth: { issuer: string; clientId: string } | null;
}

export async function loadConfig(): Promise<Config> {
  // Three files, and only the first two are required. `approvers.json` is
  // written by `govern.sh` the moment the decentralised party exists, which
  // is minutes before the holder seat finishes; `participants.json` carries
  // the same facts on a deployment that has no `govern.sh` (DevNet), where
  // they are in the file from the start. Absent means this deployment has no
  // approvers, which is the main product.
  const [seatR, mapR, approversR] = await Promise.all([
    fetch("/demo/seat.json"),
    fetch("/demo/participants.json"),
    fetch("/demo/approvers.json").catch(() => null),
  ]);
  if (!seatR.ok) throw new Error("No seat file. Run: pwsh infra/demo.ps1 seat -Tag <tag>, then start the UI with INDIVISA_TAG=<tag>.");
  if (!mapR.ok) throw new Error("No participant map. Run: pwsh infra/participants-with-parties.ps1");
  const seat = (await seatR.json()) as Seat;
  const map = (await mapR.json()) as ParticipantMap;
  // Tolerated absent, and tolerated unreadable: a 404 means this deployment
  // has no approvers, and that is a normal state rather than a fault.
  const approvers =
    approversR && approversR.ok
      ? ((await approversR.json()) as { party: Party; nodes: { node: string; member: Party; url: string }[] })
      : null;
  // Set before any submission: an authenticated Canton takes the user from
  // the token and refuses a command naming a different one.
  if (map.userId) Ledger.userId = map.userId;
  const participantOf = (party: Party): string => {
    const p = map.party_participants[party];
    if (!p) throw new Error(`no participant known for ${party}; regenerate participants-with-parties.json`);
    return p;
  };
  const baseOf = (participant: string) => `/api/${participant}`;

  // Ask each named participant who it is. Two names that answer with the
  // same id are one machine, whatever the config calls them.
  const names = [...new Set(Object.values(map.party_participants))];
  const ids = new Map<string, string | null>();
  await Promise.all(
    names.map(async (name) => {
      try {
        const r = await fetch(`${baseOf(name)}/v2/parties/participant-id`);
        ids.set(name, r.ok ? (((await r.json()) as { participantId?: string }).participantId ?? null) : null);
      } catch {
        // A node that will not say is not a node we may make claims about.
        ids.set(name, null);
      }
    }),
  );

  const nodeIdOf = (participant: string) => ids.get(participant) ?? null;
  const agentNode = participantOf(seat.payingAgent);
  const sharingWithAgent = (participant: string): NodeSharing => {
    if (participant === agentNode) return "shared";
    const mine = nodeIdOf(participant);
    const theirs = nodeIdOf(agentNode);
    if (!mine || !theirs) return "unknown";
    return mine === theirs ? "shared" : "separate";
  };
  const answered = [...ids.values()].filter(Boolean) as string[];
  const distinctNodes = answered.length === names.length ? new Set(answered).size : null;

  return {
    network: map.network,
    readOnly: map.readOnly === true,
    seat,
    participantOf,
    baseOf,
    nodeIdOf,
    sharingWithAgent,
    distinctNodes,
    decmanParty: approvers?.party ?? map.decman?.party ?? null,
    approverNodes: approvers?.nodes ?? map.decman?.nodes ?? [],
    operatorAuth: map.operator ?? null,
  };
}

/** "Meridian-Paying-Agent-sep18-20260918...-4f1df03a::1220..." -> "Meridian Paying Agent" */
export function displayName(party: Party, tag: string): string {
  const hint = party.split("::")[0];
  const cut = hint.indexOf(`-${tag}-`);
  const name = cut > 0 ? hint.slice(0, cut) : hint;
  return name.replace(/-/g, " ");
}

/** "...::1220abcd..." -> "1220abcd…" */
export function shortId(id: string, n = 10): string {
  return id.length > n ? `${id.slice(0, n)}…` : id;
}
