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
  action: "#indivisa:Indivisa.Model.Event:CorporateAction",
  schedule: "#indivisa:Indivisa.Model.Entitlement:EntitlementSchedule",
  agreement: "#indivisa:Indivisa.Model.Payment:PaymentAgreement",
  // The request a holder answers once: trailing underscore because `proposal`
  // below is the governance one, and confusing the two would be expensive.
  proposal_: "#indivisa:Indivisa.Model.Payment:PaymentProposal",
  run: "#indivisa:Indivisa.Model.Distribution:DistributionRun",
  receipt: "#indivisa:Indivisa.Model.Distribution:DistributionReceipt",
  rejected: "#indivisa:Indivisa.Model.Distribution:SettlementRejected",
  tokenRules: "#splice-test-token-v2:Splice.Testing.Tokens.TestTokenV2:TokenRules",
  // Only on a network where the governance packages are vetted. Reads of it
  // are allowed to fail: see `proposals` in queries.ts.
  proposal: "#indivisa-governance-v0:Indivisa.Governance.SettleRunProposal:SettleRunProposal",
};

export const I = {
  holding: "#splice-api-token-holding-v2:Splice.Api.Token.HoldingV2:Holding",
  allocation: "#splice-api-token-allocation-v2:Splice.Api.Token.AllocationV2:Allocation",
  // The send allocation is created by exercising the registry rules contract
  // THROUGH this interface. Naming the TokenRules template instead answers
  // `Invalid template`, because the choice is the interface's, not the
  // template's: Agent.daml reaches it with toInterfaceContractId.
  allocationFactory: "#splice-api-token-allocation-instruction-v2:Splice.Api.Token.AllocationInstructionV2:AllocationFactory",
};

type IdentifierFilter =
  | { TemplateFilter: { value: { templateId: string; includeCreatedEventBlob: boolean } } }
  | { InterfaceFilter: { value: { interfaceId: string; includeInterfaceView: boolean; includeCreatedEventBlob: boolean } } };

// Under the node default of 200 list elements; the server clamps larger values.
const PAGE_SIZE = 200;

/** Nodes that answered 405 to the paged ACS endpoint, so it is not asked
 *  twice. A property of the participant, not of a connection, hence module
 *  scope: the quickstart image is Canton 3.5.8 and every Ledger instance on
 *  it would otherwise rediscover the same 405 on every single read. */
const UNPAGED = new Set<string>();

export class LedgerError extends Error {
  constructor(public status: number, public body: string) {
    super(`${status}: ${body}`);
  }
}

/**
 * The signed-in operator's token, sent with every proxied request.
 *
 * A separate header from Authorization, which the proxy fills in with the
 * application's own ledger credential. Two identities, two headers: the party
 * that signs the settlement, and the person who asked for it.
 */
let operatorToken: string | null = null;

export function setOperatorToken(t: string | null) {
  operatorToken = t;
}

export function operatorHeaders(): Record<string, string> {
  return operatorToken ? { "X-Indivisa-Operator": "Bearer " + operatorToken } : {};
}

export class Ledger {
  /** The ledger user to submit as. Set once from the participant map. */
  static userId = "indivisa-ui";

  // `headers` is for a client outside the browser (scripts/settle.ts), which
  // has no proxy to add the bearer token for it.
  constructor(
    public readonly base: string,
    public readonly party: Party,
    private readonly headers: Record<string, string> = {},
    // Whose contracts to read. Normally just `party`. A demo console holds
    // every party's key and can read several at once, which is how the
    // holder grid fills one card per holder with one request per node
    // instead of one per holder. Submissions still act as `party` alone.
    private readonly readers?: Party[],
  ) {}

  /** The same connection, reading as these parties together. */
  reading(parties: Party[]): Ledger {
    return new Ledger(this.base, this.party, this.headers, parties);
  }

  private async post<R>(path: string, body: unknown): Promise<R> {
    const r = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...operatorHeaders(), ...this.headers },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new LedgerError(r.status, text);
    return JSON.parse(text) as R;
  }

  async ledgerEnd(): Promise<number> {
    const r = await fetch(`${this.base}/v2/state/ledger-end`, { headers: { ...operatorHeaders(), ...this.headers } });
    if (!r.ok) throw new LedgerError(r.status, await r.text());
    return (await r.json()).offset as number;
  }

  // The unpaged /v2/state/active-contracts refuses more than the node's
  // http-list-max-elements-limit (200 by default; hit with 251 allocations
  // on 18 Sep), so this walks /v2/state/active-contracts-page instead.
  // The page token carries the offset the first page was taken at; sending
  // that offset back explicitly makes the token INVALID_ACS_PAGE_TOKEN, so
  // every page request is the first request plus the token and nothing else.
  //
  // Whether the node HAS that endpoint is remembered per node (see UNPAGED),
  // because asking it again on every read costs a wasted round trip and the
  // answer cannot change under a running participant.
  private async activeContracts(filters: IdentifierFilter[], verbose = true): Promise<ActiveContract[]> {
    if (UNPAGED.has(this.base)) return this.unpagedContracts(filters, verbose);
    const eventFormat = {
      filtersByParty: Object.fromEntries(
        (this.readers ?? [this.party]).map((p) => [p, { cumulative: filters.map((identifierFilter) => ({ identifierFilter })) }]),
      ),
      verbose,
    };
    const out: ActiveContract[] = [];
    let pageToken: string | undefined;
    for (;;) {
      let page: { activeContracts: any[]; activeAtOffset: number; nextPageToken?: string };
      try {
        page = await this.post("/v2/state/active-contracts-page", { eventFormat, pageToken, maxPageSize: PAGE_SIZE });
      } catch (e) {
        // Canton before 3.5.9 (BitSafe's sandbox runs 3.5.8) has no paged
        // endpoint and answers 405; fall back to the unpaged one, which is
        // enough below the node's 200-element cap.
        if (e instanceof LedgerError && e.status === 405 && !pageToken) {
          UNPAGED.add(this.base);
          return this.unpagedContracts(filters, verbose);
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

  /**
   * The pre-3.5.9 route, taken once the node has answered 405.
   *
   * Remembering that answer matters more than it looks. Every template read
   * went paged-endpoint-405, then ledger-end, then the unpaged read: three
   * round trips where two would do. The agent's own poll makes eight template
   * reads and the register's makes six, every few seconds, on a host the
   * browser gives six connections. **The register's poll was being starved
   * outright** - found 8 October, when the rail went on saying a coupon was
   * "prepared" for as long as the page stayed open after it had been paid, and
   * a reload fixed it. A third of those requests existed only to be refused.
   */
  private async unpagedContracts(filters: IdentifierFilter[], verbose: boolean): Promise<ActiveContract[]> {
    const eventFormat = {
      filtersByParty: Object.fromEntries(
        (this.readers ?? [this.party]).map((p) => [p, { cumulative: filters.map((identifierFilter) => ({ identifierFilter })) }]),
      ),
      verbose,
    };
    const entries = await this.post<any[]>("/v2/state/active-contracts", {
      eventFormat,
      activeAtOffset: await this.ledgerEnd(),
    });
    return entries.map((x) => x.contractEntry?.JsActiveContract).filter(Boolean) as ActiveContract[];
  }

  /** Active contracts of one template, as this party sees them. */
  templates(templateId: string, withBlob = false): Promise<ActiveContract[]> {
    return this.activeContracts([{ TemplateFilter: { value: { templateId, includeCreatedEventBlob: withBlob } } }], !withBlob);
  }

  /** Active contracts implementing an interface, with their views. */
  interfaces(interfaceId: string, withBlob = false): Promise<ActiveContract[]> {
    return this.activeContracts([
      { InterfaceFilter: { value: { interfaceId, includeInterfaceView: true, includeCreatedEventBlob: withBlob } } },
    ]);
  }

  /** Submit commands as this party and wait for the commit. Returns the update id. */
  async submitAndWait(commands: unknown[], disclosedContracts: DisclosedContract[] = []): Promise<{ updateId: string; completionOffset: number }> {
    return this.post("/v2/commands/submit-and-wait", {
      commandId: `indivisa-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      // Canton takes the user from the token on an authenticated network and
      // refuses a command naming a different one. The dev server serves the
      // right id from the participant map; "indivisa-ui" is the unauthenticated
      // fallback, where any name does.
      userId: Ledger.userId,
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
