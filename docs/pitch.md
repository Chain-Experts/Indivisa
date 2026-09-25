# The pitch

Fifteen slides. Written to be read on their own, because judging is
asynchronous, and to be spoken in five minutes if we reach the Grand Final.

Each slide below gives the text that goes **on** the slide and, under it, what
to **say**. Nothing on a slide should be read aloud verbatim; the spoken line
adds to it.

Rebuild the file with:

    cd infra/pitch && npm install && npm run build

which writes `docs/Indivisa-pitch.pptx`. Then polish in PowerPoint — the
generated deck is a solid first draft, not the final word on spacing.

**Every claim here is checked against `docs/benchmark.md`,
`docs/devnet-run.md` and `CLAUDE.md`. If you change a number, change it
there too — or better, don't.**

---

## 1 — Title

> # Indivisa
> ### Corporate actions, settled in one atomic batch, without exposing the register.
>
> **Settled on Canton DevNet · run it yourself in one command**
>
> Chain-Experts · HackCanton Season 3

**Say:** A bond pays its coupon to hundreds of holders. Today that is
spreadsheets and batch files. We make it one transaction — and you can run
it yourself.

---

## 2 — The problem, in the judges' own numbers

> # A distribution is N separate payments.
> ### There is no moment at which the run is definitively finished.
>
> | | |
> |---|---|
> | **$3.42m** | average annual cost of asset-servicing errors, per market participant |
> | **3–10%** | error rates, described as routine |
> | **71% / <40%** | straight-through processing: mandatory and income events / voluntary |
> | **+23%** | annual growth in investors' asset-servicing costs |
>
> Source: Canton Network, *Post-Trade Transformation* (2025)

**Say:** A distribution is N separate payments, and there is no moment at
which the run is definitively finished. That is the shape of the problem;
these are the consequences — Canton Network's own post-trade research, not
ours. Error rates between three and ten per cent are described there as
routine.

---

## 3 — Why it has not simply moved on-chain

> **Paying a coupon publicly publishes the register.**
>
> Every holder's position size becomes public the moment the coupon pays.
>
> The register is confidential by law and by commercial sensitivity. That is
> the reason this workflow is still manual, not inertia.

**Say:** This is the thing that stops corporate actions moving onto a public
chain. It is not that nobody thought of it.

---

## 4 — What Indivisa does

> **One transaction. Every holder paid at the same instant, or nobody.**
>
> - The paying agent fires **one** settlement
> - Every holder is paid **atomically** — no partial settlement to reconcile
> - **No holder sees another's payment** — the register is never published
> - **And no single signature moves the money**

**Say:** The paying agent presses one button. Either every holder is paid, or
nothing moves. And each holder's own node receives its own line and nothing
about anyone else.

---

## 5 — Why Canton, precisely

> **The organisers' test:** *"If this product moved to a globally transparent
> chain tomorrow, what would stop working properly?"*
>
> ## Everything.
>
> Every position size becomes public, and the register is published.

**Say:** We took the organisers' own test seriously. For most ideas the honest
answer is "not much". For this one it is everything.

---

## 6 — What changed in June 2026

> **Token Standard V2 — CIP-0112, approved 12 June 2026**
>
> Multi-leg settlement where the executor sees every leg and each participant
> sees only its own.
>
> | Party | Sees |
> |---|---|
> | Each holder's participant | only its own leg |
> | The paying agent, as executor | all legs |
>
> **CIP-112 did not design this. It enabled it.**

**Say:** The worked example in the CIP is trading and netting, not corporate
actions. We are taking a new primitive somewhere its authors did not. That is
a better story than claiming we invented it, and it is the true one.

---

## 7 — How it works

> **Four steps, and only the last one moves money.**
>
> 1. **Once, at onboarding** — each holder signs one standing agreement with
>    the paying agent
> 2. **Record date** — the register is snapshotted, entitlements calculated,
>    rounded by largest remainder so the parts sum to the total exactly
> 3. **Before payment** — the agent sets aside the cash and prepares one
>    allocation per holder
> 4. **Payment date** — one `SettlementFactory_SettleBatch`
>
> Holders authorise **once**, at onboarding. Never per coupon.

**Say:** Step one is the real-world "give the paying agent your account
details". After that, every coupon lands with no action from the holder. The
standard requires the receiver's authority on every leg; we collect it once.

---

## 8 — It runs on the real network

> **Canton DevNet, 24 September 2026**
>
> Five holders paid in one transaction · 8,421.88 USD
>
> `1220652e2e4d32822c39d2ad72088e163eed04718ad1108998001b01aa3483ff466b`
>
> The deliberate failure was refused first: one holder not ready, nobody paid.
>
> Full record: `docs/devnet-run.md`

**Say:** That update id is a real transaction on Canton DevNet. We ran both
halves: the refusal first, then the settlement.

---

## 9 — Run it yourself

> ```
> cd judge && docker compose up
> ```
>
> A five-participant Canton network, the real contracts, twenty holders, and
> a coupon with one holder deliberately left out.
>
> Press the button: **refused**, and the ledger names the holder.
> Fix it, press again: **settled**.
>
> Nothing to install but Docker. No account anywhere.

**Say:** We would rather you did not take our word for any of this. One
command gives you the whole thing on your own machine.

---

## 10 — How far it goes

> **Measured, not estimated.**
>
> | Legs in one transaction | Holders | Time | Size |
> |---|---|---|---|
> | 250 | 250 | 1.6 s | 440 KB |
> | 1,000 | 1,000 | 11.1 s | 1.67 MB |
> | **13,000** | **250** | **10.4 s** | 1.52 MB |
>
> **A thousand holders: days of reconciliation become 11.1 seconds, and it is
> final.**
>
> A realistic run — one payment per holder — reaches Canton's 10 MB
> transaction budget near **6,400 holders**.
>
> Method, the second ceiling, and where each figure comes from:
> `docs/benchmark.md`

The holders column exists so that 13,000 does not read as a typo. One ceiling
on the slide; the 13,869-leg gRPC limit lives in the repo.

**On "days of reconciliation":** we have no published figure for how long a
distribution takes to reconcile today, so this is a characterisation, not a
statistic. Keep it qualitative. Every other number in this deck is sourced.

**Say:** Read the holders column — thirteen thousand legs was two hundred and
fifty holders, not thirteen thousand. Nobody had published how many legs fit
in a CIP-112 batch, so we measured it.

---

## 11 — And when one signature is not enough

> # In institutional systems, four-eyes authorisation is a requirement, not a feature.
>
> A run can name an **approver**: a decentralised party, through BitSafe's
> Decentralization Manager. One optional field; the product is unchanged
> without it.
>
> - One approval → **the ledger refuses**
> - Two of three → settles
>
> **The threshold is enforced by the ledger, not by our code.** In the demo
> all three approver nodes are ours, so the threshold is real and the
> independence is not. On DevNet the second node is BitSafe's — that is the
> version that counts.

**Say:** This is a procurement requirement, not a nice-to-have. Below the
threshold it is not our code being careful, it is the ledger refusing. And be
straight about the independence: three nodes on one machine are three nodes on
one machine.

This slide and slide 12 must agree. If you soften one, soften both.

---

## 12 — Real, simulated, planned

> **Real:** the ledger, the contracts, the settlement, the refusal, the
> privacy, every number on screen, the DevNet update id, the governance engine.
>
> **Simulated:** the cash is `TestTokenV2`, the standard's own reference asset,
> not Canton Coin. Holders and positions are generated. Three approver nodes on
> one machine are not three independent operators.
>
> **Not attempted:** corporate-action announcement data. Chainlink, with DTCC
> and Swift, is attacking that layer. We do the payment layer.

**Say:** We would rather tell you this than have you find it.

---

## 13 — What we did not build

> # What we did not build
> *known, designed, not yet built*
>
> **Scoping a run.** If 5 of 250 holders are not ready, the batch refuses for
> all 250. A paying agent needs to settle the 245 today and carry the 5 to a
> second run. The model supports it — the schedule is a list and the run is
> built from it — but the workflow, and the audit trail that says why five
> were held back, are not written.
>
> - **Production onboarding** — holders sign the standing agreement through a
>   real client, not a script
> - **The scheduled agent** — today a person presses the button; in production
>   a daemon watches payment dates
> - **Real cash** — `TestTokenV2` is the standard's reference asset; a
>   production run settles Canton Coin or a registry's own token

**Say:** This is not an apology. These are the things we know are missing, we
know how each would be built, and we would rather name them than have you find
them. The scoping one is the first thing a paying agent would ask for.

---

## 14 — What this becomes

> **The buyer is the independent debt paying agent and the corporate trustee,
> first.**
>
> - **Dividends and redemptions are the same engine** — the same
>   `DistributionRun`, a different event type
> - **Works against registers that already exist.** The bond is not tokenized;
>   only the cash is a Token Standard V2 asset
> - **The benchmark is a contribution in its own right** — the first published
>   figures for CIP-112 batch settlement, going to the Canton forum
>   regardless of how this hackathon goes

**Say:** Independent paying agents and trustees first: they carry the
reconciliation cost themselves, and they do not need a custodian's permission
to change how they settle. The bond stays where it is, which matters
commercially — the industry does not have to tokenize every instrument before
any of this is useful.

---

## 15 — Close

> # Indivisa
> ### Corporate actions, settled in one atomic batch, without exposing the register.
>
> Settled on Canton DevNet · `1220652e…f466b`
> Run it yourself: `cd judge && docker compose up`
>
> github.com/Chain-Experts/Indivisa · Apache-2.0

**Say:** One transaction. Every holder paid at the same instant, or nobody.
And no holder sees another.

---

## Notes for building it

- **Palette**, from the mark: ink `#101B26`, ledger green `#0F7A56`, accent
  blue `#0D74C4`, off-white ground `#F2F5F7`, muted `#5A6B7A`.
- **One idea per slide.** The tables are the exception and they earn it.
- **The logo** is `ui/public/indivisa-logo.png`; it sits on a dark ground.
- **Slides 8, 9 and 10 are the evidence.** If anything gets cut for time, cut
  from 5, 6 or 14 — never those three.
- **The two slides a judge remembers** are the sentence at the top of slide 2
  and the honesty of slide 13. Do not let either get trimmed in a redesign.
- For the Grand Final's five minutes, slides 1–4 should take ninety seconds.
  Most teams overrun on the problem statement.
