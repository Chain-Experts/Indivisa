// Settle a prepared run over the JSON Ledger API from Node and time it,
// submit to commit. The same call as the button in the paying agent's pane,
// without a browser and without the Daml Script runner, whose handling of
// the returned transaction tree dominated the earlier timings (see
// docs/benchmark.md, section 2).
//
// Bundled by infra/settle.ps1 with esbuild and run as:
//   node settle.mjs <ui.json> <participants-with-parties.json> <prepared.json | agent party>
//
// The third argument is either a file (infra/demo.ps1 prepare's DemoPrepared
// output) or the paying agent's party id, in which case the run, its
// allocations and the cash registry's rules contract are read from the
// ledger: the agent's one active DistributionRun, every Allocation it sees,
// the run's instrument admin as the registry, and that registry's TokenRules.
import { existsSync, readFileSync } from "node:fs";
import { I, Ledger, T, view } from "../src/ledger/client";
import { factoryDisclosure, settle } from "../src/ledger/queries";

const [uiPath, mapPath, target] = process.argv.slice(2);
if (!target) {
  console.error("usage: node settle.mjs <ui.json> <participants-with-parties.json> <prepared.json | agent party>");
  process.exit(2);
}

const ui = JSON.parse(readFileSync(uiPath, "utf8")) as { participants: Record<string, { jsonApi: string; token?: string }> };
const map = JSON.parse(readFileSync(mapPath, "utf8")) as { party_participants: Record<string, string> };

function ledgerFor(party: string): Ledger {
  const name = map.party_participants[party];
  if (!name) throw new Error(`no participant known for ${party}; regenerate the party map`);
  const p = ui.participants[name];
  if (!p) throw new Error(`ui.json has no JSON API for participant '${name}'`);
  return new Ledger(p.jsonApi.replace(/\/+$/, ""), party, p.token ? { Authorization: `Bearer ${p.token}` } : {});
}

interface Prepared { registry: string; payingAgent: string; rulesCid: string; runCid: string; allocationCids: string[] }

async function discover(payingAgent: string): Promise<Prepared> {
  const agent = ledgerFor(payingAgent);
  const runs = await agent.templates(T.run);
  if (runs.length !== 1) throw new Error(`expected one active DistributionRun for the agent, found ${runs.length}`);
  const run = runs[0].createdEvent;
  const registry = run.createArgument.instrument.admin as string;
  const allocations = await agent.interfaces(I.allocation);
  const runId = run.createArgument.runId as string;
  const allocationCids = allocations
    .filter((a) => view(a, ":Allocation")?.settlement?.id === runId)
    .map((a) => a.createdEvent.contractId);
  const rules = await ledgerFor(registry).templates(T.tokenRules);
  if (rules.length !== 1) throw new Error(`expected one TokenRules at the registry, found ${rules.length}`);
  return { registry, payingAgent, rulesCid: rules[0].createdEvent.contractId, runCid: run.contractId, allocationCids };
}

const prepared: Prepared = existsSync(target)
  ? (() => { const raw = JSON.parse(readFileSync(target, "utf8")); return { registry: raw.registry, payingAgent: raw.payingAgent, rulesCid: raw.rulesCid, runCid: raw.runCid, allocationCids: raw.allocationCids }; })()
  : await discover(target);

const registry = ledgerFor(prepared.registry);
const agent = ledgerFor(prepared.payingAgent);
const factory = await factoryDisclosure(registry, prepared.rulesCid);
const legs = prepared.allocationCids.length - 1;
console.log(`settling ${legs} legs (${prepared.allocationCids.length} allocations) as ${prepared.payingAgent.split("::")[0]}`);
const r = await settle(agent, prepared.runCid, prepared.allocationCids, prepared.rulesCid, factory);
console.log(`settled ${legs} legs in ${r.ms} ms, update id ${r.updateId}`);
console.log(JSON.stringify({ legs, ms: r.ms, updateId: r.updateId, completionOffset: r.completionOffset }));
