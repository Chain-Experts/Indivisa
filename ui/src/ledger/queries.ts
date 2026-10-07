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
  schedule: { cid: ContractId; entries: Entitlement[]; total: number; amountPerUnit: number; recordDate: string; paymentDate: string; policy: string; kind: string } | null;
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
          // The run id is derived from it, so the page has to carry it.
          kind: sched.createdEvent.createArgument.kind,
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

// ---------------------------------------------------------------------------
// Setting a coupon up: announce, freeze, derive, create the run
// ---------------------------------------------------------------------------

/** What an operator fills in for the next coupon. The engine takes all of it;
 *  the demo used to pass the same values as script arguments. */
export interface CouponTerms {
  amountPerUnit: string;
  recordDate: string;
  paymentDate: string;
  policy: "LargestRemainder" | "RoundHalfUpResidualToIssuer";
}

/** `runFromSchedule`'s derivation, in the one place the page has to agree with
 *  the model: `isin <> "/" <> show kind <> "/" <> show paymentDate`. If the
 *  model's changes, the run is not found rather than silently wrong. */
export const runIdFor = (isin: string, kind: string, paymentDate: string) => `${isin}/${kind}/${paymentDate}`;

const findAction = (cs: ActiveContract[], isin: string, t: CouponTerms) =>
  cs.find((c) => {
    const a = c.createdEvent.createArgument;
    return a.isin === isin && a.recordDate === t.recordDate && a.paymentDate === t.paymentDate;
  });

/**
 * Announce the event. **Submitted by the issuer, not the paying agent.**
 *
 * This is the one step on the screen that is somebody else's. `CorporateAction`
 * is signed by the issuer and only observed by the agent: in a deployment the
 * announcement arrives from the issuer and the agent acts on it. The console
 * can submit it at all only because it is a demo harness holding every party's
 * credential, which it says on the page, and the panel says so again beside
 * this step.
 *
 * Idempotent, like every step here: an announcement already on the ledger for
 * these terms is reused, so retrying after a later step failed does not file a
 * second one.
 */
export async function announce(
  issuer: Ledger,
  agentParty: Party,
  isin: string,
  kind: string,
  currency: string,
  terms: CouponTerms,
): Promise<ContractId> {
  const already = findAction(await issuer.templates(T.action), isin, terms);
  if (already) return already.createdEvent.contractId;
  await issuer.submitAndWait([
    {
      CreateCommand: {
        templateId: T.action,
        createArguments: {
          issuer: issuer.party,
          payingAgent: agentParty,
          isin,
          kind,
          currency,
          amountPerUnit: terms.amountPerUnit,
          recordDate: terms.recordDate,
          paymentDate: terms.paymentDate,
        },
      },
    },
  ]);
  const made = findAction(await issuer.templates(T.action), isin, terms);
  if (!made) throw new Error("the announcement was submitted but could not be read back");
  return made.createdEvent.contractId;
}

/**
 * Freeze the register as of the record date.
 *
 * The registrar's action, and in this deployment the registrar **is** the
 * paying agent: `Instrument.registrar` is the agent, and
 * `CorporateAction_Entitle` refuses a snapshot kept by anybody else. Where a
 * separate company keeps the register this is their step, and the agent
 * receives the snapshot rather than taking it.
 *
 * `Instrument_Snapshot` verifies every position contract it is handed and
 * aggregates per holder, so the agent can leave a position out and cannot
 * invent one.
 */
export async function freezeRegister(agent: Ledger, isin: string, recordDate: string): Promise<ContractId> {
  const match = (cs: ActiveContract[]) =>
    cs.find((c) => c.createdEvent.createArgument.isin === isin && c.createdEvent.createArgument.recordDate === recordDate);
  const already = match(await agent.templates(T.snapshot));
  if (already) return already.createdEvent.contractId;

  const instrument = (await agent.templates(T.instrument)).find((c) => c.createdEvent.createArgument.isin === isin);
  if (!instrument) throw new Error(`no instrument on the ledger for ${isin}`);
  const positionCids = (await agent.templates(T.position))
    .filter((c) => c.createdEvent.createArgument.isin === isin && c.createdEvent.createArgument.registrar === agent.party)
    .map((c) => c.createdEvent.contractId);
  if (!positionCids.length) throw new Error(`no positions on the ledger for ${isin}`);

  await agent.submitAndWait([
    {
      ExerciseCommand: {
        templateId: T.instrument,
        contractId: instrument.createdEvent.contractId,
        choice: "Instrument_Snapshot",
        choiceArgument: { recordDate, positionCids },
      },
    },
  ]);
  const made = match(await agent.templates(T.snapshot));
  if (!made) throw new Error("the register was frozen but the snapshot could not be read back");
  return made.createdEvent.contractId;
}

/**
 * Derive the schedule from the announcement and the snapshot, on the ledger.
 *
 * The paying agent's own, and the step that makes a schedule checkable rather
 * than asserted: the choice recomputes every entitlement from the frozen
 * positions instead of accepting a table somebody uploaded, and it refuses a
 * snapshot of another instrument, of another record date, or kept by another
 * registrar.
 */
export async function entitle(
  agent: Ledger,
  actionCid: ContractId,
  snapshotCid: ContractId,
  isin: string,
  paymentDate: string,
  policy: string,
): Promise<ContractId> {
  const match = (cs: ActiveContract[]) =>
    cs.find((c) => c.createdEvent.createArgument.isin === isin && c.createdEvent.createArgument.paymentDate === paymentDate);
  const already = match(await agent.templates(T.schedule));
  if (already) return already.createdEvent.contractId;
  await agent.submitAndWait([
    {
      ExerciseCommand: {
        templateId: T.action,
        contractId: actionCid,
        choice: "CorporateAction_Entitle",
        choiceArgument: { snapshotCid, policy },
      },
    },
  ]);
  const made = match(await agent.templates(T.schedule));
  if (!made) throw new Error("the schedule was derived but could not be read back");
  return made.createdEvent.contractId;
}

/**
 * Create the run the schedule pays, leg for leg.
 *
 * This is `runFromSchedule` in the model, and the two have to agree: the run
 * id and the leg ids are derived the same way, and `Run_Settle` rebuilds the
 * transfer legs from these fields when it settles.
 *
 * **`approver` is what makes a run governed.** Set, it joins the executors, so
 * the settle needs that party's authority as well as the agent's and the agent
 * can no longer release the payout alone. This is the step that used to be
 * `docker compose run --rm govern prepare`.
 */
export async function createRun(
  agent: Ledger,
  cashRegistry: Party,
  scheduleCid: ContractId,
  schedule: { isin: string; kind: string; currency: string; paymentDate: string; entries: Entitlement[] },
  approver: Party | null,
): Promise<string> {
  const runId = runIdFor(schedule.isin, schedule.kind, schedule.paymentDate);
  const already = (await agent.templates(T.run)).find((c) => c.createdEvent.createArgument.runId === runId);
  if (already) return runId;
  await agent.submitAndWait([
    {
      CreateCommand: {
        templateId: T.run,
        createArguments: {
          payingAgent: agent.party,
          runId,
          instrument: { admin: cashRegistry, id: schedule.currency },
          agentAccount: basicAccount(agent.party),
          legs: schedule.entries.map((e, i) => ({
            legId: `${runId}#${i + 1}`,
            recipient: e.holder,
            amount: e.amount,
          })),
          schedule: scheduleCid,
          approver,
        },
      },
    },
  ]);
  return runId;
}

// ---------------------------------------------------------------------------
// Preparing a run: the allocations, from the page
// ---------------------------------------------------------------------------

/** `basicAccount` in Daml: an owner, no provider, no id. A receipt
 *  allocation's authorizer is compared against this exactly, so it has to
 *  match exactly. */
const basicAccount = (owner: Party) => ({ owner, provider: null, id: "" });

const EMPTY_META = { values: {} };

/** The registry's choice context, in the shape `settle` already sends. */
const rulesContext = (rulesCid: ContractId) => ({
  context: { values: { "testTokenV2/tokenRules": { tag: "AV_ContractId", value: rulesCid } } },
  meta: EMPTY_META,
});

/** A participant stamps ledger time from its own clock, and a container's can
 *  sit behind the browser's. Five minutes in the past is what
 *  `Fixtures.requestedAt` uses for the same reason. */
const requestedAt = () => new Date(Date.now() - 5 * 60_000).toISOString();

/** Receipt allocations per command. Fifty is `Agent.daml`'s number and it was
 *  measured: a command costs about a second of round trip on a real
 *  synchronizer, so 250 holders is five commands rather than 250. The settle
 *  itself is never batched; it is the one transaction. */
const RECEIPTS_PER_COMMAND = 50;

interface RunArgs {
  payingAgent: Party;
  runId: string;
  instrument: { admin: Party; id: string };
  agentAccount: { owner: Party | null; provider: Party | null; id: string };
  legs: { legId: string; recipient: Party; amount: string }[];
  approver: Party | null;
}

/**
 * Create the allocations a prepared run is still missing, as the paying agent.
 *
 * This is `Indivisa.Test.Demo:demo_prepare` without the withholding, and
 * deliberately the same shape: look at which accounts have already authorised
 * something for this run, and create only what is absent. Pressing it twice is
 * therefore safe, which matters, because an operator presses it after a
 * refusal and cannot be sure what landed before the refusal.
 *
 * **Every command here is the paying agent's own.** The receipts go through
 * each holder's `PaymentAgreement`, so no holder submits anything: that is what
 * the standing agreement is for, and it is the reason this belongs on the
 * agent's screen at all. `Instrument` and `Position` are the registrar's book
 * and are **not** created here; `Accept` on a `PaymentProposal` is each
 * holder's own submission on its own node and must never move onto this screen.
 */
export async function allocateMissing(
  agent: Ledger,
  runCid: ContractId,
  existing: { authorizer: Party | null; isSend: boolean }[],
  rulesCid: ContractId,
  factory: DisclosedContract,
): Promise<{ receipts: number; send: boolean }> {
  const runs = await agent.templates(T.run);
  const found = runs.find((c) => c.createdEvent.contractId === runCid);
  if (!found) throw new Error("the run is no longer on the ledger; reload the page");
  const run = found.createdEvent.createArgument as RunArgs;

  // Exactly `runExecutors`: the agent, and the approver when the run names
  // one. The standard compares this list against the batch's, so a mismatch
  // would pass here and fail at the settle.
  const executors = run.approver ? [run.payingAgent, run.approver] : [run.payingAgent];
  const settlement = { executors, id: run.runId, cid: null, meta: EMPTY_META };
  const transferLegs = run.legs.map((l) => ({
    transferLegId: l.legId,
    sender: run.agentAccount,
    receiver: basicAccount(l.recipient),
    amount: l.amount,
    instrumentId: run.instrument.id,
    meta: EMPTY_META,
  }));

  const allocated = new Set(existing.map((a) => a.authorizer).filter((p): p is Party => !!p));
  const haveSend = existing.some((a) => a.isSend);

  // The receipts. One allocation per holder carrying only that holder's own
  // legs, which is what stops a holder's allocation naming anybody else.
  const wanted = Array.from(new Set(run.legs.map((l) => l.recipient).filter((p) => !allocated.has(p))));
  let receipts = 0;
  if (wanted.length) {
    const agreements = await agent.templates(T.agreement);
    const byHolder = new Map<Party, ContractId>();
    for (const c of agreements) {
      const a = c.createdEvent.createArgument;
      if (a.instrument.id === run.instrument.id && a.instrument.admin === run.instrument.admin)
        byHolder.set(a.holder, c.createdEvent.contractId);
    }
    const commands = wanted.map((holder) => {
      const cid = byHolder.get(holder);
      // The holder never signed, so there is nothing to allocate under. It is
      // the one failure here an operator can act on, so it names the holder.
      if (!cid) throw new Error(`no standing agreement for ${holder}: that holder has not been onboarded`);
      return {
        ExerciseCommand: {
          templateId: T.agreement,
          contractId: cid,
          choice: "CreateReceiptAllocation",
          choiceArgument: {
            factoryCid: rulesCid,
            choiceArg: {
              settlement,
              allocation: {
                admin: run.instrument.admin,
                authorizer: basicAccount(holder),
                transferLegSides: transferLegs
                  .filter((l) => l.receiver.owner === holder)
                  .map((l) => ({
                    transferLegId: l.transferLegId,
                    side: "ReceiverSide",
                    otherside: l.sender,
                    amount: l.amount,
                    instrumentId: l.instrumentId,
                    meta: EMPTY_META,
                  })),
                settlementDeadline: null,
                nextIterationFunding: null,
                committed: false,
                meta: EMPTY_META,
              },
              requestedAt: requestedAt(),
              inputHoldingCids: [],
              extraArgs: rulesContext(rulesCid),
              actors: [holder],
            },
          },
        },
      };
    });
    for (let i = 0; i < commands.length; i += RECEIPTS_PER_COMMAND) {
      const batch = commands.slice(i, i + RECEIPTS_PER_COMMAND);
      await agent.submitAndWait(batch, [factory]);
      receipts += batch.length;
    }
  }

  if (haveSend) return { receipts, send: false };

  // The agent's own side: one committed allocation carrying every leg, funded
  // from its unlocked holdings. Committed on purpose, so the agent cannot
  // withdraw it and race the settlement. `cancelRun` is the way back out.
  const holdings = await agent.interfaces(I.holding);
  const inputHoldingCids = holdings
    .map((c) => ({ cid: c.createdEvent.contractId, v: view<HoldingView>(c, ":Holding") }))
    .filter(({ v }) => v && v.lock == null && v.account.owner === agent.party && v.instrumentId.id === run.instrument.id)
    .map(({ cid }) => cid);
  if (!inputHoldingCids.length) throw new Error("the paying agent holds no unlocked cash in this instrument");
  await agent.submitAndWait(
    [
      {
        ExerciseCommand: {
          templateId: I.allocationFactory,
          contractId: rulesCid,
          choice: "AllocationFactory_Allocate",
          choiceArgument: {
            settlement,
            allocation: {
              admin: run.instrument.admin,
              authorizer: run.agentAccount,
              transferLegSides: transferLegs.map((l) => ({
                transferLegId: l.transferLegId,
                side: "SenderSide",
                otherside: l.receiver,
                amount: l.amount,
                instrumentId: l.instrumentId,
                meta: EMPTY_META,
              })),
              settlementDeadline: null,
              nextIterationFunding: null,
              committed: true,
              meta: EMPTY_META,
            },
            requestedAt: requestedAt(),
            inputHoldingCids,
            extraArgs: rulesContext(rulesCid),
            actors: [agent.party],
          },
        },
      },
    ],
    [factory],
  );
  return { receipts, send: true };
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
