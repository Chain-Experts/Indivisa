// JSON Ledger API v2 over fetch. One client per party, pointed at the
// participant that hosts it. No application backend: the browser talks to
// the ledger, through the dev server's proxy (nginx in production).
//
// Shapes verified against Canton 3.5.17's /docs/openapi on 18 Sep 2026.

export type Party = string;
export type ContractId = string;

export interface CreatedEvent {
  offset: number;
  nodeId: number;
  contractId: ContractId;
  templateId: string;
  createArgument: any;
  createdEventBlob: string;
  interfaceViews: { interfaceId: string; viewValue: any }[];
  signatories: Party[];
  observers: Party[];
  createdAt: string;
}

export interface ActiveContract {
  createdEvent: CreatedEvent;
  synchronizerId: string;
}

export interface DisclosedContract {
  templateId: string;
  contractId: ContractId;
  createdEventBlob: string;
  synchronizerId: string;
}

/** Template ids by package name: resolved by the participant to the vetted version. */
export const T = {
  instrument: "#indivisa:Indivisa.Model.Register:Instrument",
  position: "#indivisa:Indivisa.Model.Register:Position",
  snapshot: "#indivisa:Indivisa.Model.Register:RegisterSnapshot",
  schedule: "#indivisa:Indivisa.Model.Entitlement:EntitlementSchedule",
  agreement: "#indivisa:Indivisa.Model.Payment:PaymentAgreement",
  run: "#indivisa:Indivisa.Model.Distribution:DistributionRun",
  receipt: "#indivisa:Indivisa.Model.Distribution:DistributionReceipt",
  rejected: "#indivisa:Indivisa.Model.Distribution:SettlementRejected",
  tokenRules: "#splice-test-token-v2:Splice.Testing.Tokens.TestTokenV2:TokenRules",
};

export const I = {
  holding: "#splice-api-token-holding-v2:Splice.Api.Token.HoldingV2:Holding",
  allocation: "#splice-api-token-allocation-v2:Splice.Api.Token.AllocationV2:Allocation",
};

type IdentifierFilter =
  | { TemplateFilter: { value: { templateId: string; includeCreatedEventBlob: boolean } } }
  | { InterfaceFilter: { value: { interfaceId: string; includeInterfaceView: boolean; includeCreatedEventBlob: boolean } } };

export class LedgerError extends Error {
  constructor(public status: number, public body: string) {
    super(`${status}: ${body}`);
  }
}

export class Ledger {
  constructor(public readonly base: string, public readonly party: Party) {}

  private async post<R>(path: string, body: unknown): Promise<R> {
    const r = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new LedgerError(r.status, text);
    return JSON.parse(text) as R;
  }

  async ledgerEnd(): Promise<number> {
    const r = await fetch(`${this.base}/v2/state/ledger-end`);
    if (!r.ok) throw new LedgerError(r.status, await r.text());
    return (await r.json()).offset as number;
  }

  private async activeContracts(filters: IdentifierFilter[], verbose = true): Promise<ActiveContract[]> {
    const activeAtOffset = await this.ledgerEnd();
    const entries = await this.post<any[]>("/v2/state/active-contracts", {
      eventFormat: {
        filtersByParty: { [this.party]: { cumulative: filters.map((identifierFilter) => ({ identifierFilter })) } },
        verbose,
      },
      activeAtOffset,
    });
    return entries.map((e) => e.contractEntry?.JsActiveContract).filter(Boolean) as ActiveContract[];
  }

  /** Active contracts of one template, as this party sees them. */
  templates(templateId: string, withBlob = false): Promise<ActiveContract[]> {
    return this.activeContracts([{ TemplateFilter: { value: { templateId, includeCreatedEventBlob: withBlob } } }], !withBlob);
  }

  /** Active contracts implementing an interface, with their views. */
  interfaces(interfaceId: string): Promise<ActiveContract[]> {
    return this.activeContracts([{ InterfaceFilter: { value: { interfaceId, includeInterfaceView: true, includeCreatedEventBlob: false } } }]);
  }

  /** Submit commands as this party and wait for the commit. Returns the update id. */
  async submitAndWait(commands: unknown[], disclosedContracts: DisclosedContract[] = []): Promise<{ updateId: string; completionOffset: number }> {
    return this.post("/v2/commands/submit-and-wait", {
      commandId: `indivisa-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: "indivisa-ui",
      actAs: [this.party],
      commands,
      disclosedContracts,
    });
  }

  /** The update that produced a given offset, e.g. a contract's create offset. */
  async updateAtOffset(offset: number): Promise<{ updateId: string; commandId: string; effectiveAt: string } | null> {
    try {
      const r = await this.post<any>("/v2/updates/update-by-offset", {
        offset,
        updateFormat: {
          includeTransactions: {
            eventFormat: { filtersByParty: { [this.party]: { cumulative: [] } }, verbose: false },
            transactionShape: "TRANSACTION_SHAPE_ACS_DELTA",
          },
        },
      });
      const tx = r.update?.Transaction?.value;
      return tx ? { updateId: tx.updateId, commandId: tx.commandId, effectiveAt: tx.effectiveAt } : null;
    } catch {
      return null;
    }
  }
}

/** The view of an interface contract, if the participant computed it. */
export function view<V = any>(c: ActiveContract, interfaceSuffix: string): V | null {
  const v = c.createdEvent.interfaceViews.find((iv) => iv.interfaceId.endsWith(interfaceSuffix));
  return (v?.viewValue as V) ?? null;
}

/** Decimals arrive as strings. */
export const num = (s: string | number | null | undefined): number => (s == null ? 0 : Number(s));
