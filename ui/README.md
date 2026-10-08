# The settlement console

Four desks, one command, as many ledger connections as there are parties on screen.

In a deployment the paying agent, the issuer, each holder and each approver are four different companies, each running its own application and signing in to it. Here they are four pages so you can walk between them, and every page says so rather than letting the split imply more isolation than it has.

| Desk | What it is for |
|---|---|
| **Paying agent** (`/`) | The register down the left, one row per coupon rather than per bond, because a bond pays twice a year for ten years and the unit of work is the event. Then the figures, the coupon set-up, the release choice and the settle. Four tabs below it read the selected coupon four ways. |
| **Issuer** (`/issuer`) | Declares the terms of an event and nothing else. No holders, no schedule, no settlement, because an issuer has no business in any of them. |
| **Holder** (`/holders`) | Every holder on the register, and a page each read **as that holder from that holder's own node**: their cash, their positions, whether their settlement instructions are on file, and the one action a holder ever takes. |
| **Approver** (`/approvers`) | The members of the decentralised party, the threshold read from its own governance rules, and where each member stands on the request in front of it. A member confirms, and can **take that agreement back** for as long as the settlement has not executed, which drops the count and makes the payment unreleasable again. There is no reject button, because a threshold does not need one: a member that does not want the payment simply never confirms. |

The paying agent's four tabs:

| Tab | What it is |
|---|---|
| **Holders** | A card for every holder, filled from the participant that hosts that holder. Search, filter by leg state, sort. Click a card and the page asks that node, **as that holder and nobody else**, what it will hand over: its own contracts, and the count of everyone else's. |
| **Schedule** | The entitlement schedule as the executor sees it, sortable by any column, with each leg marked *waiting*, *ready* or *paid*. The one view a single party is entitled to. |
| **Privacy** | The same question asked once per participant and refreshed continuously: six counts of what that node holds about other holders. |
| **Activity** | What the ledger did. The settlement with its update id and offset, and every refusal with the reason the ledger gave, both read back as contracts, not log lines. |

The grid costs one request set per **node**, not per holder, so twenty cards and two hundred and fifty cost the same. That is why the per-party check is a separate read: it is the claim, so it is made the expensive, honest way.

This console holds every party's credential, the way a demo harness does. Say so when showing it, and then show that the nodes still answer for one party at a time, which is the whole point.

Everything on screen is read live from the JSON Ledger API of the participant that hosts the party. The button submits `Run_Settle` as the paying agent, with the cash registry's factory disclosed, and shows the update id the ledger returns. There is no application backend.

## Run it

A network up with the model vetted, a demo seated and prepared (see `infra/README.md`):

```
pwsh infra/demo.ps1 seat    -Holders 250 -Tag sep18
pwsh infra/demo.ps1 prepare -Tag sep18 -Withhold 1   # arm the failure
cd ui && npm install
INDIVISA_TAG=sep18 npm run dev                       # PowerShell: $env:INDIVISA_TAG="sep18"; npm run dev
```

Open http://localhost:5173. Press settle: the ledger refuses, because one holder has given the paying agent no settlement instructions, and a `SettlementRejected` record is written. Open that holder on the **Holder** desk and press **Provide settlement instructions**, then **Authorise** on the agent's desk, then settle again: every holder paid in one transaction, update id on screen. No terminal step in the middle; `demo.ps1 prepare` does the same thing from a shell if you prefer.

Environment variables the dev server reads:

| Variable | Default | Meaning |
|---|---|---|
| `INDIVISA_NETWORK` | `localnet` | which `infra/<network>/` to read `ui.json` and the party map from |
| `INDIVISA_TAG` | `demo` | which seat, `infra/<network>/demo/seat-<tag>.json` |
| `INDIVISA_SEAT` | | a seat file path, overriding the tag |

## How it is wired

- `vite.config.ts` proxies `/api/<participant>/` to each participant's JSON Ledger API as listed in `infra/<network>/ui.json` (the API sets no CORS headers), adding that participant's bearer token when the file has one, so tokens never reach the browser. It serves the seat file and the party-to-participant map at `/demo/*`; the map is stripped to `party_participants` first because the runner's file also carries tokens. In production nginx does the proxy.
- `src/ledger/client.ts` holds the JSON Ledger API v2 calls used: `ledger-end`, `active-contracts-page` (templates by `#package-name:Module:Template`, interfaces with views; paged, because the unpaged endpoint caps at 200 elements; falls back to it on a Canton before 3.5.9, which has no paged endpoint), `submit-and-wait`, `update-by-offset`. Shapes verified against Canton 3.5.17's `/docs/openapi`.
- `src/ledger/queries.ts`: what each pane reads, and the settle.
- `src/panes/PayingAgent.tsx`, `src/panes/Holder.tsx`: the panes. `Holder` is one component rendered three times.
- `src/config.ts`: reads the seat and the map; derives display names from party ids.

## What it shows and what it does not

Real: every number, the settle, the update id, the rejection and its reason. Simulated: the cash is `TestTokenV2`, the holders and positions are synthetic. Not shown: the allocation phase (run from a shell before the button, `demo.ps1 prepare`), because it is many commands and the point of the page is the one transaction.

The per-holder check lists six counts that are always zero: other holders' positions, cash, allocations, the schedule, the run, the rejection records. On LocalNet each holder is on its own participant, so those zeros are not a filter; the data never reached the node. On a DevNet with one validator hosting every party the counts stay zero too, but then they are a visibility filter inside one node rather than data that never arrived; say so if that is the topology shown.
