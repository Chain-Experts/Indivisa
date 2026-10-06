// scripts/settle.ts
import { existsSync, readFileSync } from "node:fs";

// src/ledger/client.ts
var T = {
  instrument: "#indivisa:Indivisa.Model.Register:Instrument",
  position: "#indivisa:Indivisa.Model.Register:Position",
  snapshot: "#indivisa:Indivisa.Model.Register:RegisterSnapshot",
  schedule: "#indivisa:Indivisa.Model.Entitlement:EntitlementSchedule",
  agreement: "#indivisa:Indivisa.Model.Payment:PaymentAgreement",
  run: "#indivisa:Indivisa.Model.Distribution:DistributionRun",
  receipt: "#indivisa:Indivisa.Model.Distribution:DistributionReceipt",
  rejected: "#indivisa:Indivisa.Model.Distribution:SettlementRejected",
  tokenRules: "#splice-test-token-v2:Splice.Testing.Tokens.TestTokenV2:TokenRules"
};
var I = {
  holding: "#splice-api-token-holding-v2:Splice.Api.Token.HoldingV2:Holding",
  allocation: "#splice-api-token-allocation-v2:Splice.Api.Token.AllocationV2:Allocation"
};
var PAGE_SIZE = 200;
var LedgerError = class extends Error {
  constructor(status, body) {
    super(`${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
};
var Ledger = class {
  // `headers` is for a client outside the browser (scripts/settle.ts), which
  // has no proxy to add the bearer token for it.
  constructor(base, party, headers = {}) {
    this.base = base;
    this.party = party;
    this.headers = headers;
  }
  async post(path, body) {
    const r2 = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.headers },
      body: JSON.stringify(body)
    });
    const text = await r2.text();
    if (!r2.ok) throw new LedgerError(r2.status, text);
    return JSON.parse(text);
  }
  async ledgerEnd() {
    const r2 = await fetch(`${this.base}/v2/state/ledger-end`, { headers: this.headers });
    if (!r2.ok) throw new LedgerError(r2.status, await r2.text());
    return (await r2.json()).offset;
  }
  // The unpaged /v2/state/active-contracts refuses more than the node's
  // http-list-max-elements-limit (200 by default; hit with 251 allocations
  // on 18 Sep), so this walks /v2/state/active-contracts-page instead.
  // The page token carries the offset the first page was taken at; sending
  // that offset back explicitly makes the token INVALID_ACS_PAGE_TOKEN, so
  // every page request is the first request plus the token and nothing else.
  async activeContracts(filters, verbose = true) {
    const eventFormat = {
      filtersByParty: { [this.party]: { cumulative: filters.map((identifierFilter) => ({ identifierFilter })) } },
      verbose
    };
    const out = [];
    let pageToken;
    for (; ; ) {
      let page;
      try {
        page = await this.post("/v2/state/active-contracts-page", { eventFormat, pageToken, maxPageSize: PAGE_SIZE });
      } catch (e) {
        if (e instanceof LedgerError && e.status === 405 && !pageToken) {
          const entries = await this.post("/v2/state/active-contracts", { eventFormat, activeAtOffset: await this.ledgerEnd() });
          return entries.map((x) => x.contractEntry?.JsActiveContract).filter(Boolean);
        }
        throw e;
      }
      for (const e of page.activeContracts ?? []) {
        const c = e.contractEntry?.JsActiveContract;
        if (c) out.push(c);
      }
      if (!page.nextPageToken) return out;
      pageToken = page.nextPageToken;
    }
  }
  /** Active contracts of one template, as this party sees them. */
  templates(templateId, withBlob = false) {
    return this.activeContracts([{ TemplateFilter: { value: { templateId, includeCreatedEventBlob: withBlob } } }], !withBlob);
  }
  /** Active contracts implementing an interface, with their views. */
  interfaces(interfaceId) {
    return this.activeContracts([{ InterfaceFilter: { value: { interfaceId, includeInterfaceView: true, includeCreatedEventBlob: false } } }]);
  }
  /** Submit commands as this party and wait for the commit. Returns the update id. */
  async submitAndWait(commands, disclosedContracts = []) {
    return this.post("/v2/commands/submit-and-wait", {
      commandId: `indivisa-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: "indivisa-ui",
      actAs: [this.party],
      commands,
      disclosedContracts
    });
  }
  /** The update that produced a given offset, e.g. a contract's create offset. */
  async updateAtOffset(offset) {
    try {
      const r2 = await this.post("/v2/updates/update-by-offset", {
        offset,
        updateFormat: {
          includeTransactions: {
            eventFormat: { filtersByParty: { [this.party]: { cumulative: [] } }, verbose: false },
            transactionShape: "TRANSACTION_SHAPE_ACS_DELTA"
          }
        }
      });
      const tx = r2.update?.Transaction?.value;
      return tx ? { updateId: tx.updateId, commandId: tx.commandId, effectiveAt: tx.effectiveAt } : null;
    } catch {
      return null;
    }
  }
};
function view(c, interfaceSuffix) {
  const v = c.createdEvent.interfaceViews.find((iv) => iv.interfaceId.endsWith(interfaceSuffix));
  return v?.viewValue ?? null;
}

// src/ledger/queries.ts
async function factoryDisclosure(registry2, rulesCid) {
  const rules = await registry2.templates(T.tokenRules, true);
  const c = rules.find((x) => x.createdEvent.contractId === rulesCid);
  if (!c) throw new Error("the cash registry's rules contract was not found on its participant");
  return {
    templateId: c.createdEvent.templateId,
    contractId: c.createdEvent.contractId,
    createdEventBlob: c.createdEvent.createdEventBlob,
    synchronizerId: c.synchronizerId
  };
}
async function settle(agent2, runCid, allocationCids, rulesCid, factory2) {
  const t0 = performance.now();
  const r2 = await agent2.submitAndWait(
    [
      {
        ExerciseCommand: {
          templateId: T.run,
          contractId: runCid,
          choice: "Run_Settle",
          choiceArgument: {
            factoryCid: rulesCid,
            allocationCids,
            extraArgs: {
              context: { values: { "testTokenV2/tokenRules": { tag: "AV_ContractId", value: rulesCid } } },
              meta: { values: {} }
            }
          }
        }
      }
    ],
    [factory2]
  );
  return { ...r2, ms: Math.round(performance.now() - t0) };
}

// scripts/settle.ts
var [uiPath, mapPath, target] = process.argv.slice(2);
if (!target) {
  console.error("usage: node settle.mjs <ui.json> <participants-with-parties.json> <prepared.json | agent party>");
  process.exit(2);
}
var ui = JSON.parse(readFileSync(uiPath, "utf8"));
if (ui.insecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
var map = JSON.parse(readFileSync(mapPath, "utf8"));
function ledgerFor(party) {
  const name = map.party_participants[party];
  if (!name) throw new Error(`no participant known for ${party}; regenerate the party map`);
  const p = ui.participants[name];
  if (!p) throw new Error(`ui.json has no JSON API for participant '${name}'`);
  return new Ledger(p.jsonApi.replace(/\/+$/, ""), party, p.token ? { Authorization: `Bearer ${p.token}` } : {});
}
async function discover(payingAgent) {
  const agent2 = ledgerFor(payingAgent);
  const runs = await agent2.templates(T.run);
  if (runs.length !== 1) throw new Error(`expected one active DistributionRun for the agent, found ${runs.length}`);
  const run = runs[0].createdEvent;
  const registry2 = run.createArgument.instrument.admin;
  const allocations = await agent2.interfaces(I.allocation);
  const runId = run.createArgument.runId;
  const allocationCids = allocations.filter((a) => view(a, ":Allocation")?.settlement?.id === runId).map((a) => a.createdEvent.contractId);
  const rules = await ledgerFor(registry2).templates(T.tokenRules);
  if (rules.length !== 1) throw new Error(`expected one TokenRules at the registry, found ${rules.length}`);
  return { registry: registry2, payingAgent, rulesCid: rules[0].createdEvent.contractId, runCid: run.contractId, allocationCids };
}
var prepared = existsSync(target) ? (() => {
  const raw = JSON.parse(readFileSync(target, "utf8"));
  return { registry: raw.registry, payingAgent: raw.payingAgent, rulesCid: raw.rulesCid, runCid: raw.runCid, allocationCids: raw.allocationCids };
})() : await discover(target);
var registry = ledgerFor(prepared.registry);
var agent = ledgerFor(prepared.payingAgent);
var factory = await factoryDisclosure(registry, prepared.rulesCid);
var legs = prepared.allocationCids.length - 1;
console.log(`settling ${legs} legs (${prepared.allocationCids.length} allocations) as ${prepared.payingAgent.split("::")[0]}`);
var r = await settle(agent, prepared.runCid, prepared.allocationCids, prepared.rulesCid, factory);
console.log(`settled ${legs} legs in ${r.ms} ms, update id ${r.updateId}`);
console.log(JSON.stringify({ legs, ms: r.ms, updateId: r.updateId, completionOffset: r.completionOffset }));
