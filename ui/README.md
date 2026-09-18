# The four panes

One page, four parties, four ledger connections. The paying agent's pane on
the left shows the whole distribution and has the one button; three holder
panes show what each holder's own participant holds, which is its own line
and nothing else. That contrast is the demo.

Everything on screen is read live from the JSON Ledger API of the
participant that hosts the party. The button submits `Run_Settle` as the
paying agent, with the cash registry's factory disclosed, and shows the
update id the ledger returns. There is no application backend.

## Run it

LocalNet up, the model vetted, a demo seated and prepared (see
`infra/README.md`):

```
pwsh infra/localnet/demo.ps1 seat    -Holders 250 -Tag sep18
pwsh infra/localnet/demo.ps1 prepare -Tag sep18 -Withhold 1   # arm the failure
cd ui && npm install
INDIVISA_SEAT=../infra/localnet/demo/seat-sep18.json npm run dev     # PowerShell: $env:INDIVISA_SEAT="..."; npm run dev
```

Open http://localhost:5173. Press the button: the ledger refuses, the pane
says so, and a `SettlementRejected` record is written. Then
`demo.ps1 prepare -Tag sep18` (nothing withheld) and press again: settled,
every holder paid in one transaction, update id on screen.

## How it is wired

- `vite.config.ts` proxies `/api/<participant>/` to each participant's JSON
  Ledger API (the API sets no CORS headers) and serves the seat file and the
  party-to-participant map at `/demo/*`. In production nginx does the proxy.
- `src/ledger/client.ts` — the JSON Ledger API v2 calls used: `ledger-end`,
  `active-contracts` (templates by `#package-name:Module:Template`, interfaces
  with views), `submit-and-wait`, `update-by-offset`. Shapes verified against
  Canton 3.5.17's `/docs/openapi`.
- `src/ledger/queries.ts` — what each pane reads, and the settle.
- `src/panes/PayingAgent.tsx`, `src/panes/Holder.tsx` — the panes.
  `Holder` is one component rendered three times.
- `src/config.ts` — reads the seat and the map; derives display names from
  party ids.

## What it shows and what it does not

Real: every number, the settle, the update id, the rejection and its
reason. Simulated: the cash is `TestTokenV2`, the holders and positions are
synthetic. Not shown: the allocation phase (run from a shell before the
button, `demo.ps1 prepare`), because it is many commands and the point of
the pane is the one transaction.

The holder panes list six counts that are always zero: other holders'
positions, cash, allocations, the schedule, the run, the rejection records.
On LocalNet each holder is on its own participant, so those zeros are not a
filter; the data never reached the node.
