// What the panes need to know before they read the ledger: which parties to
// show and which participant hosts each. Both come from files the demo
// scripts wrote (served by the dev server; see vite.config.ts).

import type { Party } from "./ledger/client";

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
}

export interface Config {
  network: string;
  readOnly: boolean;
  seat: Seat;
  /** participant name -> proxied base URL */
  baseOf: (participant: string) => string;
  /** party -> participant name */
  participantOf: (party: Party) => string;
}

export async function loadConfig(): Promise<Config> {
  const [seatR, mapR] = await Promise.all([fetch("/demo/seat.json"), fetch("/demo/participants.json")]);
  if (!seatR.ok) throw new Error("No seat file. Run: pwsh infra/demo.ps1 seat -Tag <tag>, then start the UI with INDIVISA_TAG=<tag>.");
  if (!mapR.ok) throw new Error("No participant map. Run: pwsh infra/participants-with-parties.ps1");
  const seat = (await seatR.json()) as Seat;
  const map = (await mapR.json()) as ParticipantMap;
  const participantOf = (party: Party): string => {
    const p = map.party_participants[party];
    if (!p) throw new Error(`no participant known for ${party}; regenerate participants-with-parties.json`);
    return p;
  };
  return { network: map.network, readOnly: map.readOnly === true, seat, participantOf, baseOf: (participant) => `/api/${participant}` };
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
