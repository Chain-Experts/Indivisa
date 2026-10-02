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
  /** The filed request for approval, when this run names one. Null on an
   *  ungoverned run, and null on a network that does not vet the governance
   *  package at all. */
  proposal: { cid: ContractId; description: string } | null;
}

export async function agentState(agent: Ledger, runId: string, isin: string): Promise<AgentState> {
  const [instruments, schedules, runs, allocs, rejected, receipts, proposals] = await Promise.all([
    agent.templates(T.instrument),
    agent.templates(T.schedule),
    agent.templates(T.run),
    agent.interfaces(I.allocation),
    agent.templates(T.rejected),
    agent.templates(T.receipt),
    // The governance package is vetted on DevNet and deliberately not on the
    // judges' local stack, where the vote runs in its own containers. A
    // participant that has never seen the package answers with an error, and
    // that is not a fault worth surfacing: an ungoverned run has no proposal.
    agent.templates(T.proposal).catch(() => []),
  ]);

  const inst = instruments.find((c) => c.createdEvent.createArgument.isin === isin)?.createdEvent.createArgument;
  const sched = schedules.find((c) => c.createdEvent.createArgument.isin === isin);
  const run = runs.find((c) => c.createdEvent.createArgument.runId === runId);
  // A run id can settle more than once: preparing a tag whose run has already
  // settled creates a fresh run under the same id, and the earlier receipt is
  // still on the ledger. A receipt created BEFORE the current run belongs to
  // that earlier settlement, and treating it as this one's makes the page
  // announce a settlement that has not happened (seen 1 Oct).
  const receipt = receipts
    .filter((c) => c.createdEvent.createArgument.runId === runId)
    .filter((c) => !run || c.createdEvent.offset > run.createdEvent.offset)
    .sort((a, b) => b.createdEvent.offset - a.createdEvent.offset)[0];

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
      // Refusals from an earlier run under the same id are history, not this
      // run's state; showing them would put a red box above a fresh run.
      .filter((c) => !run || c.createdEvent.offset > run.createdEvent.offset)
      .map((c) => ({ cid: c.createdEvent.contractId, ...c.createdEvent.createArgument, legsRequested: Number(c.createdEvent.createArgument.legsRequested) }))
      .sort((a, b) => (a.attemptedAt < b.attemptedAt ? 1 : -1)),
    receipt: receiptOut,
    proposal: (() => {
      if (!run) return null;
      // The NEWEST proposal for this run, not the first the ledger happens to
      // return. `prepare` reuses one DistributionRun per run id, so a
      // proposal that was filed, confirmed and never executed stays active
      // and matches the same runCid as a fresh one. Taking either arbitrarily
      // would put somebody else is vote on screen - the same mistake that
      // showed an old receipt and a stale refusal, and the same fix: let the
      // ledger ordering decide.
      const mine = proposals
        .filter((c) => c.createdEvent.createArgument.runCid === run.createdEvent.contractId)
        .sort((x, y) => y.createdEvent.offset - x.createdEvent.offset);
      const p = mine[0];
      return p ? { cid: p.createdEvent.contractId, description: p.createdEvent.createArgument.description } : null;
    })(),
  };
}

/**
 * Ask the approvers, instead of settling.
 *
 * On a run that names an approver the agent cannot settle: `Run_Settle` needs
 * that party's authority as well as its own, and the ledger refuses the agent
 * acting alone. What it can do is sign a request. This creates the
 * `SettleRunProposal` the approvers then confirm through their own
 * Decentralization Managers, and whose `executeImpl` performs the settlement
 * once they have.
 *
 * Nothing is disclosed here: a create that stores a contract id does not need
 * to read the contract. The disclosure belongs to the execute, which happens
 * on an approver's node.
 */
export async function proposeSettlement(
  agent: Ledger,
  approver: Party,
  runCid: ContractId,
  allocationCids: ContractId[],
  rulesCid: ContractId,
  description: string,
) {
  return agent.submitAndWait([
    {
      CreateCommand: {
        templateId: T.proposal,
        createArguments: {
          governanceParty: approver,
          proposer: agent.party,
          runCid,
          factoryCid: rulesCid,
          allocationCids,
          extraArgs: {
            context: { values: { "testTokenV2/tokenRules": { tag: "AV_ContractId", value: rulesCid } } },
            meta: { values: {} },
          },
          description,
        },
      },
    },
  ]);
}

/**
 * Withdraw a request the agent should not have made.
 *
 * A request filed by mistake - the wrong run, the wrong moment, a figure
 * noticed too late - should not have to be left lying on the ledger waiting
 * for approvers to ignore it. The proposer is the sole signatory of
 * `SettleRunProposal`, so it can archive it, and archiving is itself a
 * ledger event: the request and its withdrawal both stay in the history.
 *
 * It is the proposer alone who may do this, and only before the settlement
 * executes. Once executed there is nothing to withdraw - the money has moved.
 *
 * Approvers who have already confirmed are not consulted, and should not be:
 * their confirmation was permission to settle, not an obligation on the agent
 * to go through with it. Measured on DevNet on 2 October: the Decentralization
 * Manager drops the action from its approvals by itself once the contract is
 * archived, so nothing is left sitting on their board.
 *
 * This does NOT release the agent cash. The allocations survive untouched -
 * six before, six after - because the request and the funding are different
 * commitments. Releasing the funds is `cancelRun`, and on a governed run that
 * is not the agent to do alone.
 */
export async function withdrawProposal(agent: Ledger, proposalCid: ContractId) {
  return agent.submitAndWait([
    {
      ExerciseCommand: {
        templateId: T.proposal,
        contractId: proposalCid,
        choice: "Archive",
        choiceArgument: {},
      },
    },
  ]);
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

/**
 * The contracts the executing node has to be handed.
 *
 * An approver's node runs the action's `executeImpl` and has never seen the
 * registry's rules or the agent's locked cash, so both travel with the
 * execute request as disclosed contracts. One locked holding per send
 * allocation, which for a coupon is one.
 */
export async function executeDisclosures(
  agent: Ledger,
  registry: Ledger,
  rulesCid: ContractId,
): Promise<{ contract_id: string; blob: string }[]> {
  const [rules, holdings] = await Promise.all([
    registry.templates(T.tokenRules, true),
    agent.interfaces(I.holding, true),
  ]);
  const out: { contract_id: string; blob: string }[] = [];

  const r = rules.find((c) => c.createdEvent.contractId === rulesCid);
  if (!r) throw new Error("the cash registry's rules contract was not found on its participant");
  out.push({ contract_id: r.createdEvent.contractId, blob: r.createdEvent.createdEventBlob });

  for (const c of holdings) {
    const v = view<HoldingView>(c, ":Holding");
    if (!v || v.lock == null || v.account.owner !== agent.party) continue;
    out.push({ contract_id: c.createdEvent.contractId, blob: c.createdEvent.createdEventBlob });
  }
  if (out.length < 2) throw new Error("no locked holding found for the paying agent; was the run prepared?");
  return out;
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

/**
 * Cancel a run that has been prepared but not yet asked for.
 *
 * `prepare` does not merely plan a settlement: it creates the allocations, and
 * the agent own SEND allocation **locks its cash**. A coupon found to be wrong
 * at this stage has real money tied up behind it, so there has to be a way to
 * release it.
 *
 * **`Allocation_Cancel`, and it needs the executors.** The first version used
 * `Allocation_Withdraw`, reasoning that the agent authorises its own send
 * allocation. The ledger refused it on DevNet on 2 October:
 *
 *     cannot-withdraw-committed-allocation
 *
 * Our send allocation is created **committed**, and the standard is explicit:
 * "If set to True, then the authorizer cannot withdraw the allocation until
 * the settlement deadline. Use committed allocations for cases where the
 * executors need a guarantee that the allocation will be available until
 * settlement." Withdraw is the authorizer undoing something nobody has relied
 * on yet; once committed, the ways out are the executors settling, the
 * executors cancelling, the deadline passing, or the admin expiring it.
 *
 * So cancelling is an executors action and `actors` must be the settlement
 * executors. On an ungoverned run that is the paying agent alone. **On a
 * governed run it is the agent and the approver**, so the agent cannot release
 * the cash by itself - which is right rather than inconvenient: the commitment
 * is what makes an approval worth anything, so undoing it cannot be unilateral
 * either. The page offers this control only where the agent is the sole
 * executor; see RunBar.
 *
 * Only the send allocation locks anything, so one choice releases the funds
 * and makes the batch unsettleable. The holders standing authorisations are
 * left alone: they lock nothing, and a corrected `prepare` reuses them rather
 * than asking every holder twice.
 */
export async function cancelRun(
  agent: Ledger,
  sendAllocationCid: ContractId,
  executors: Party[],
  rulesCid: ContractId,
  factory: DisclosedContract,
) {
  return agent.submitAndWait(
    [
      {
        ExerciseCommand: {
          templateId: I.allocation,
          contractId: sendAllocationCid,
          choice: "Allocation_Cancel",
          choiceArgument: {
            actors: executors,
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
