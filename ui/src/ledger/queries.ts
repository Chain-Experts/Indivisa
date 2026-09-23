// What each pane reads. Every query is party-scoped and goes to that party's
// own participant, so what a pane shows is exactly what that node holds.

import { Ledger, T, I, view, num, type ActiveContract, type Party, type ContractId, type DisclosedContract } from "./client";

// ---------------------------------------------------------------------------
// Shared shapes (the Daml records, as the JSON API renders them)
// ---------------------------------------------------------------------------

export interface Entitlement { holder: Party; quantity: string; exact: string; amount: string }

export interface AllocationView {
  settlement: { id: string; executors: Party[] };
  allocation: {
    authorizer: { owner: Party | null; provider: Party | null; id: string };
    transferLegSides: { transferLegId: string; side: "SenderSide" | "ReceiverSide"; otherside: { owner: Party | null }; amount: string; instrumentId: string }[];
    committed: boolean;
  };
}

export interface HoldingView {
  account: { owner: Party | null; provider: Party | null; id: string };
  instrumentId: { admin: Party; id: string };
  amount: string;
  lock: unknown | null;
}

// ---------------------------------------------------------------------------
// The paying agent
// ---------------------------------------------------------------------------

export interface AgentState {
  instrument: { name: string; isin: string; currency: string; couponRate: number; maturity: string } | null;
  schedule: { cid: ContractId; entries: Entitlement[]; total: number; amountPerUnit: number; recordDate: string; paymentDate: string; policy: string } | null;
  run: { cid: ContractId; legs: number; total: number; approver: Party | null } | null;
  allocations: { cid: ContractId; authorizer: Party | null; legs: number; isSend: boolean }[];
  rejections: { cid: ContractId; attemptedAt: string; legsRequested: number; reason: string }[];
  receipt: { cid: ContractId; legsSettled: number; total: number; offset: number; updateId: string | null; effectiveAt: string | null } | null;
}

export async function agentState(agent: Ledger, runId: string, isin: string): Promise<AgentState> {
  const [instruments, schedules, runs, allocs, rejected, receipts] = await Promise.all([
    agent.templates(T.instrument),
    agent.templates(T.schedule),
    agent.templates(T.run),
    agent.interfaces(I.allocation),
    agent.templates(T.rejected),
    agent.templates(T.receipt),
  ]);

  const inst = instruments.find((c) => c.createdEvent.createArgument.isin === isin)?.createdEvent.createArgument;
  const sched = schedules.find((c) => c.createdEvent.createArgument.isin === isin);
  const run = runs.find((c) => c.createdEvent.createArgument.runId === runId);
  const receipt = receipts.find((c) => c.createdEvent.createArgument.runId === runId);

  const allocations = allocs
    .map((c) => ({ c, v: view<AllocationView>(c, ":Allocation") }))
    .filter(({ v }) => v && v.settlement.id === runId)
    .map(({ c, v }) => ({
      cid: c.createdEvent.contractId,
      authorizer: v!.allocation.authorizer.owner,
      legs: v!.allocation.transferLegSides.length,
      isSend: v!.allocation.transferLegSides.some((s) => s.side === "SenderSide"),
    }));

  let receiptOut: AgentState["receipt"] = null;
  if (receipt) {
    const a = receipt.createdEvent.createArgument;
    const upd = await agent.updateAtOffset(receipt.createdEvent.offset);
    receiptOut = {
      cid: receipt.createdEvent.contractId,
      legsSettled: Number(a.legsSettled),
      total: num(a.total),
      offset: receipt.createdEvent.offset,
      updateId: upd?.updateId ?? null,
      effectiveAt: upd?.effectiveAt ?? null,
    };
  }

  return {
    instrument: inst ? { name: inst.name, isin: inst.isin, currency: inst.currency, couponRate: num(inst.couponRate), maturity: inst.maturity } : null,
    schedule: sched
      ? {
          cid: sched.createdEvent.contractId,
          entries: sched.createdEvent.createArgument.entries,
          total: num(sched.createdEvent.createArgument.total),
          amountPerUnit: num(sched.createdEvent.createArgument.amountPerUnit),
          recordDate: sched.createdEvent.createArgument.recordDate,
          paymentDate: sched.createdEvent.createArgument.paymentDate,
          policy: sched.createdEvent.createArgument.policy,
        }
      : null,
    run: run ? { cid: run.createdEvent.contractId, legs: run.createdEvent.createArgument.legs.length, total: run.createdEvent.createArgument.legs.reduce((s: number, l: any) => s + num(l.amount), 0), approver: run.createdEvent.createArgument.approver ?? null } : null,
    allocations,
    rejections: rejected
      .filter((c) => c.createdEvent.createArgument.runId === runId)
      .map((c) => ({ cid: c.createdEvent.contractId, ...c.createdEvent.createArgument, legsRequested: Number(c.createdEvent.createArgument.legsRequested) }))
      .sort((a, b) => (a.attemptedAt < b.attemptedAt ? 1 : -1)),
    receipt: receiptOut,
  };
}

/** The factory the settle needs, disclosed from the registry's own participant. */
export async function factoryDisclosure(registry: Ledger, rulesCid: ContractId): Promise<DisclosedContract> {
  const rules = await registry.templates(T.tokenRules, true);
  const c = rules.find((x) => x.createdEvent.contractId === rulesCid);
  if (!c) throw new Error("the cash registry's rules contract was not found on its participant");
  return {
    templateId: c.createdEvent.templateId,
    contractId: c.createdEvent.contractId,
    createdEventBlob: c.createdEvent.createdEventBlob,
    synchronizerId: c.synchronizerId,
  };
}

/** The one button. Exercises Run_Settle as the paying agent; the ledger decides. */
export async function settle(agent: Ledger, runCid: ContractId, allocationCids: ContractId[], rulesCid: ContractId, factory: DisclosedContract) {
  const t0 = performance.now();
  const r = await agent.submitAndWait(
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
              meta: { values: {} },
            },
          },
        },
      },
    ],
    [factory],
  );
  return { ...r, ms: Math.round(performance.now() - t0) };
}

/** The agent's own record of a refusal, written after the ledger said no. */
export async function recordRejection(agent: Ledger, runId: string, legsRequested: number, reason: string) {
  return agent.submitAndWait([
    {
      CreateCommand: {
        templateId: T.rejected,
        createArguments: {
          payingAgent: agent.party,
          runId,
          attemptedAt: new Date().toISOString(),
          legsRequested: String(legsRequested),
          reason: reason.slice(0, 2000),
        },
      },
    },
  ]);
}

// ---------------------------------------------------------------------------
// A holder
// ---------------------------------------------------------------------------

export interface HolderState {
  positions: number;          // units of the instrument, summed
  agreement: boolean;
  myAllocation: { amount: number; cid: ContractId } | null;
  cash: number;               // unlocked balance in the instrument's currency
  cashContracts: number;
  // What this node holds about anyone else. The point of the demo.
  others: { positions: number; holdings: number; allocations: number; schedules: number; runs: number; rejections: number };
}

export async function holderState(holder: Ledger, runId: string, isin: string, currency: string): Promise<HolderState> {
  const [positions, agreements, allocs, holdings, schedules, runs, rejected] = await Promise.all([
    holder.templates(T.position),
    holder.templates(T.agreement),
    holder.interfaces(I.allocation),
    holder.interfaces(I.holding),
    holder.templates(T.schedule),
    holder.templates(T.run),
    holder.templates(T.rejected),
  ]);
  const me = holder.party;
  const mine = (c: ActiveContract) => c.createdEvent.createArgument.holder === me;

  const myAlloc = allocs
    .map((c) => ({ c, v: view<AllocationView>(c, ":Allocation") }))
    .find(({ v }) => v && v.settlement.id === runId && v.allocation.authorizer.owner === me);

  const myHoldings = holdings
    .map((c) => ({ c, v: view<HoldingView>(c, ":Holding") }))
    .filter(({ v }) => v && v.account.owner === me && v.instrumentId.id === currency);

  return {
    positions: positions.filter(mine).filter((c) => c.createdEvent.createArgument.isin === isin).reduce((s, c) => s + num(c.createdEvent.createArgument.quantity), 0),
    agreement: agreements.some(mine),
    myAllocation: myAlloc
      ? { cid: myAlloc.c.createdEvent.contractId, amount: myAlloc.v!.allocation.transferLegSides.reduce((s, l) => s + num(l.amount), 0) }
      : null,
    cash: myHoldings.filter(({ v }) => v!.lock == null).reduce((s, { v }) => s + num(v!.amount), 0),
    cashContracts: myHoldings.length,
    others: {
      positions: positions.filter((c) => !mine(c)).length,
      holdings: holdings.filter((c) => view<HoldingView>(c, ":Holding")?.account.owner !== me).length,
      allocations: allocs.filter((c) => view<AllocationView>(c, ":Allocation")?.allocation.authorizer.owner !== me).length,
      schedules: schedules.length,
      runs: runs.length,
      rejections: rejected.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Every holder on one node, in one pass
// ---------------------------------------------------------------------------

/** One holder's own facts, read from the node that hosts it. */
export interface HolderFacts {
  party: Party;
  units: number;
  agreement: boolean;
  allocated: number | null;
  cash: number;
  cashContracts: number;
}

// The grid shows a card per holder, and a card per holder must not mean a
// request per holder: at 250 holders that is a thousand round trips every
// poll. Instead one request per node reads all of its holders together
// (`Ledger.reading`), and the result is sliced by owner. The privacy claim
// is untouched, because it is about what a node can answer for a party, not
// about how many parties one request names; the per-party read that proves
// it is `holderState`, run on demand from a card.
export async function nodeHolders(
  node: Ledger,
  parties: Party[],
  runId: string,
  isin: string,
  currency: string,
): Promise<Map<Party, HolderFacts>> {
  const out = new Map<Party, HolderFacts>();
  if (parties.length === 0) return out;
  for (const p of parties) out.set(p, { party: p, units: 0, agreement: false, allocated: null, cash: 0, cashContracts: 0 });

  const all = node.reading(parties);
  const [positions, agreements, allocs, holdings] = await Promise.all([
    all.templates(T.position),
    all.templates(T.agreement),
    all.interfaces(I.allocation),
    all.interfaces(I.holding),
  ]);

  for (const c of positions) {
    const a = c.createdEvent.createArgument;
    const f = out.get(a.holder);
    if (f && a.isin === isin) f.units += num(a.quantity);
  }
  for (const c of agreements) {
    const f = out.get(c.createdEvent.createArgument.holder);
    if (f) f.agreement = true;
  }
  for (const c of allocs) {
    const v = view<AllocationView>(c, ":Allocation");
    if (!v || v.settlement.id !== runId) continue;
    const f = v.allocation.authorizer.owner ? out.get(v.allocation.authorizer.owner) : undefined;
    if (f) f.allocated = (f.allocated ?? 0) + v.allocation.transferLegSides.reduce((s, l) => s + num(l.amount), 0);
  }
  for (const c of holdings) {
    const v = view<HoldingView>(c, ":Holding");
    if (!v || v.instrumentId.id !== currency || !v.account.owner) continue;
    const f = out.get(v.account.owner);
    if (!f) continue;
    f.cashContracts += 1;
    if (v.lock == null) f.cash += num(v.amount);
  }
  return out;
}
