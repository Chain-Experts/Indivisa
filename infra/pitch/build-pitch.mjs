// Builds docs/Indivisa-pitch.pptx from the content in docs/pitch.md.
// Keep the two in step: pitch.md is the source of truth for the words.
//
//   cd infra/pitch && npm install && npm run build
import PptxGenJS from "pptxgenjs";

const REPO = "D:/Dev/ChainExperts/Indivisa";
const INK = "101B26", GREEN = "0F7A56", BLUE = "0D74C4", PAPER = "F2F5F7",
      MUTED = "5A6B7A", WHITE = "FFFFFF", AMBER = "8A6A1C", RED = "A52626";

const p = new PptxGenJS();
p.layout = "LAYOUT_16x9";           // 10 x 5.625 in
p.author = "Chain-Experts";
p.title = "Indivisa";
p.subject = "Corporate actions, settled in one atomic batch, without exposing the register.";

const W = 10, H = 5.625, M = 0.6;

function slide(title, eyebrow) {
  const s = p.addSlide();
  s.background = { color: PAPER };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.09, fill: { color: GREEN } });
  if (eyebrow) {
    s.addText(eyebrow.toUpperCase(), {
      x: M, y: 0.34, w: W - 2 * M, h: 0.25,
      fontFace: "Consolas", fontSize: 10, color: BLUE, charSpacing: 2,
    });
  }
  s.addText(title, {
    x: M, y: eyebrow ? 0.58 : 0.5, w: W - 2 * M, h: 0.8,
    fontFace: "Segoe UI", fontSize: 26, bold: true, color: INK, valign: "top",
  });
  return s;
}

function bullets(s, items, y = 1.7, size = 16) {
  s.addText(
    items.map((t) => ({
      text: typeof t === "string" ? t : t.text,
      options: { bullet: { code: "2014" }, breakLine: true, bold: t.bold ?? false, color: t.color ?? INK },
    })),
    { x: M, y, w: W - 2 * M, h: H - y - 0.4, fontFace: "Segoe UI", fontSize: size, color: INK, lineSpacingMultiple: 1.3 },
  );
}

// ---- 1. title -------------------------------------------------------------
{
  const s = p.addSlide();
  s.background = { color: INK };
  s.addImage({ path: `${REPO}/ui/public/indivisa-logo.png`, x: M, y: 0.85, w: 1.95, h: 1.3 });
  s.addText("Indivisa", { x: M, y: 2.3, w: W - 2 * M, h: 0.85, fontFace: "Segoe UI", fontSize: 50, bold: true, color: WHITE });
  s.addText("Corporate actions, settled in one atomic batch,\nwithout exposing the register.", {
    x: M, y: 3.1, w: W - 2 * M, h: 0.85, fontFace: "Segoe UI", fontSize: 19, color: "9FB8CB", lineSpacingMultiple: 1.2,
  });
  s.addText("Settled on Canton DevNet  ·  run it yourself in one command", {
    x: M, y: 4.08, w: W - 2 * M, h: 0.32, fontFace: "Segoe UI", fontSize: 15, bold: true, color: "63D3A4",
  });
  s.addText("Chain-Experts  ·  HackCanton Season 3", {
    x: M, y: 4.72, w: W - 2 * M, h: 0.3, fontFace: "Consolas", fontSize: 12, color: MUTED,
  });
  s.addNotes("A bond pays its coupon to hundreds of holders. Today that is spreadsheets and batch files. We make it one transaction - and you can run it yourself.");
}

// ---- 2. the problem -------------------------------------------------------
{
  const s = slide("A distribution is N separate payments.", "the problem");
  s.addText("There is no moment at which the run is definitively finished.", {
    x: M, y: 1.34, w: W - 2 * M, h: 0.42, fontFace: "Segoe UI", fontSize: 19, color: GREEN, bold: true,
  });
  s.addTable(
    [
      ["$3.42m", "average annual cost of asset-servicing errors, per market participant"],
      ["3–10%", "error rates, described as routine"],
      ["71% / <40%", "straight-through processing: mandatory and income events / voluntary"],
      ["+23%", "annual growth in investors' asset-servicing costs"],
    ].map((r) =>
      r.map((c, j) => ({
        text: c,
        options: {
          bold: j === 0, color: j === 0 ? INK : INK,
          fontSize: j === 0 ? 17 : 13,
          fontFace: j === 0 ? "Consolas" : "Segoe UI", valign: "middle",
        },
      })),
    ),
    { x: M, y: 1.95, w: W - 2 * M, colW: [2.3, 6.5], border: { type: "solid", color: "D5DEE5", pt: 1 }, rowH: 0.42 },
  );
  s.addText("Source: Canton Network, Post-Trade Transformation (2025)", {
    x: M, y: 4.5, w: W - 2 * M, h: 0.3, fontFace: "Segoe UI", fontSize: 11, color: MUTED, italic: true,
  });
  s.addNotes("A distribution is N separate payments, and there is no moment at which the run is definitively finished. That is the shape of the problem, and these are the consequences - Canton Network's own post-trade research, not ours. Error rates between three and ten per cent are described there as routine.");
}

// ---- 3. why not on-chain --------------------------------------------------
{
  const s = slide("Paying a coupon publicly publishes the register.", "why it has not moved");
  s.addText("Every holder's position size becomes public\nthe moment the coupon pays.", {
    x: M, y: 1.75, w: W - 2 * M, h: 1.05, fontFace: "Segoe UI", fontSize: 23, color: INK, lineSpacingMultiple: 1.25,
  });
  s.addText("The register is confidential by law and by commercial sensitivity.\nThat is the reason this workflow is still manual, not inertia.", {
    x: M, y: 3.05, w: W - 2 * M, h: 1, fontFace: "Segoe UI", fontSize: 16, color: MUTED, lineSpacingMultiple: 1.3,
  });
  s.addNotes("This is the thing that stops corporate actions moving onto a public chain. It is not that nobody thought of it.");
}

// ---- 4. what it does ------------------------------------------------------
{
  const s = slide("One transaction. Every holder paid at the same instant, or nobody.", "what Indivisa does");
  bullets(s, [
    { text: "The paying agent fires one settlement" },
    { text: "Every holder is paid atomically, with no partial settlement to reconcile" },
    { text: "No holder sees another's payment, and the register is never published", bold: true, color: GREEN },
    { text: "And no single signature moves the money", bold: true, color: BLUE },
  ], 2.0, 17);
  s.addNotes("One button. Either every holder is paid or nothing moves. Each holder's node receives its own line and nothing about anyone else. And above a threshold, no one person can release it at all.");
}

// ---- 5. why canton --------------------------------------------------------
{
  const s = slide("The organisers' test", "why Canton, precisely");
  s.addText('"If this product moved to a globally transparent chain tomorrow,\nwhat would stop working properly?"', {
    x: M, y: 1.7, w: W - 2 * M, h: 0.95, fontFace: "Segoe UI", fontSize: 17, color: MUTED, italic: true, lineSpacingMultiple: 1.25,
  });
  s.addText("Everything.", { x: M, y: 2.85, w: W - 2 * M, h: 0.9, fontFace: "Segoe UI", fontSize: 46, bold: true, color: GREEN });
  s.addText("Every position size becomes public, and the register is published.", {
    x: M, y: 3.85, w: W - 2 * M, h: 0.5, fontFace: "Segoe UI", fontSize: 16, color: INK,
  });
  s.addNotes("We took the organisers' own test seriously. For most ideas the honest answer is 'not much'. For this one it is everything.");
}

// ---- 6. CIP-112 -----------------------------------------------------------
{
  const s = slide("Token Standard V2: CIP-0112, approved 12 June 2026", "what changed");
  s.addText("Multi-leg settlement where the executor sees every leg,\nand each participant sees only its own.", {
    x: M, y: 1.55, w: W - 2 * M, h: 0.8, fontFace: "Segoe UI", fontSize: 17, color: INK, lineSpacingMultiple: 1.25,
  });
  s.addTable(
    [
      ["Each holder's participant", "only its own leg"],
      ["The paying agent, as executor", "all legs"],
    ].map((r) => r.map((c, j) => ({ text: c, options: { bold: j === 0, color: j === 0 ? GREEN : INK, fontSize: 15, fontFace: "Segoe UI", valign: "middle" } }))),
    { x: M, y: 2.55, w: W - 2 * M, colW: [4.2, 4.6], border: { type: "solid", color: "D5DEE5", pt: 1 }, rowH: 0.42 },
  );
  s.addText("CIP-112 did not design this. It enabled it.", {
    x: M, y: 3.9, w: W - 2 * M, h: 0.5, fontFace: "Segoe UI", fontSize: 20, bold: true, color: BLUE,
  });
  s.addNotes("The worked example in the CIP is trading and netting, not corporate actions. We are taking a new primitive somewhere its authors did not. That is a better story than claiming we invented it, and it is the true one.");
}

// ---- 7. how it works ------------------------------------------------------
{
  const s = slide("Four steps, and only the last one moves money.", "how it works");
  bullets(s, [
    { text: "Once, at onboarding: each holder signs one standing agreement with the paying agent" },
    { text: "Record date: the register is snapshotted and entitlements calculated, rounded so the parts sum to the total exactly" },
    { text: "Before payment: the agent sets aside the cash and prepares one allocation per holder" },
    { text: "Payment date: one SettlementFactory_SettleBatch", bold: true, color: GREEN },
  ], 1.7, 15);
  s.addText("Holders authorise once, at onboarding. Never per coupon.", {
    x: M, y: 4.5, w: W - 2 * M, h: 0.4, fontFace: "Segoe UI", fontSize: 15, bold: true, color: INK,
  });
  s.addNotes("Step one is the real-world 'give the paying agent your account details'. After that every coupon lands with no action from the holder. The standard requires the receiver's authority on every leg; we collect it once.");
}

// ---- 8. DevNet ------------------------------------------------------------
{
  const s = slide("Canton DevNet, 24 September 2026", "it runs on the real network");
  s.addText("Five holders paid in one transaction  ·  8,421.88 USD", {
    x: M, y: 1.6, w: W - 2 * M, h: 0.45, fontFace: "Segoe UI", fontSize: 20, bold: true, color: INK,
  });
  s.addShape(p.ShapeType.rect, { x: M, y: 2.2, w: W - 2 * M, h: 0.7, fill: { color: "DCEFE6" }, line: { color: GREEN, pt: 1 } });
  s.addText("1220652e2e4d32822c39d2ad72088e163eed04718ad1108998001b01aa3483ff466b", {
    x: M + 0.15, y: 2.2, w: W - 2 * M - 0.3, h: 0.7, fontFace: "Consolas", fontSize: 11, color: GREEN, valign: "middle",
  });
  s.addText("The deliberate failure was refused first: one holder not ready, nobody paid.", {
    x: M, y: 3.15, w: W - 2 * M, h: 0.45, fontFace: "Segoe UI", fontSize: 16, color: INK,
  });
  s.addText("Full record: docs/devnet-run.md", { x: M, y: 4.55, w: W - 2 * M, h: 0.3, fontFace: "Consolas", fontSize: 11, color: MUTED });
  s.addNotes("That update id is a real transaction on Canton DevNet. We ran both halves: the refusal first, then the settlement.");
}

// ---- 9. run it yourself ---------------------------------------------------
{
  const s = slide("Run it yourself", "the working demo");
  s.addShape(p.ShapeType.rect, { x: M, y: 1.55, w: W - 2 * M, h: 0.68, fill: { color: INK } });
  s.addText("cd quickstart && docker compose up", {
    x: M + 0.2, y: 1.55, w: W - 2 * M - 0.4, h: 0.68, fontFace: "Consolas", fontSize: 20, color: "63D3A4", valign: "middle",
  });
  bullets(s, [
    { text: "A five-participant Canton network, the real contracts, twenty holders" },
    { text: "One holder deliberately left out. Press the button: refused, and the ledger names them" },
    { text: "Fix it, press again: settled", bold: true, color: GREEN },
    { text: "Nothing to install but Docker. No account anywhere" },
  ], 2.5, 15);
  s.addNotes("We would rather you did not take our word for any of this. One command gives you the whole thing on your own machine.");
}

// ---- 10. benchmark --------------------------------------------------------
{
  const s = slide("Measured, not estimated.", "how far it goes");
  s.addTable(
    [
      [
        { text: "Legs in one transaction", options: { bold: true, fontSize: 11, color: MUTED } },
        { text: "Holders", options: { bold: true, fontSize: 11, color: MUTED } },
        { text: "Time", options: { bold: true, fontSize: 11, color: MUTED } },
        { text: "Size", options: { bold: true, fontSize: 11, color: MUTED } },
      ],
      [{ text: "250", options: { fontFace: "Consolas" } }, { text: "250", options: { fontFace: "Consolas" } }, { text: "1.6 s" }, { text: "440 KB" }],
      [{ text: "1,000", options: { fontFace: "Consolas" } }, { text: "1,000", options: { fontFace: "Consolas" } }, { text: "11.1 s" }, { text: "1.67 MB" }],
      [
        { text: "13,000", options: { fontFace: "Consolas", bold: true, color: GREEN } },
        { text: "250", options: { fontFace: "Consolas", bold: true, color: GREEN } },
        { text: "10.4 s", options: { bold: true, color: GREEN } },
        { text: "1.52 MB", options: { bold: true, color: GREEN } },
      ],
    ],
    { x: M, y: 1.6, w: W - 2 * M, colW: [3.3, 1.8, 1.85, 1.85], border: { type: "solid", color: "D5DEE5", pt: 1 }, rowH: 0.38, fontFace: "Segoe UI", fontSize: 14, valign: "middle" },
  );
  s.addShape(p.ShapeType.rect, { x: M, y: 3.35, w: W - 2 * M, h: 0.62, fill: { color: "DCEFE6" } });
  s.addText("A thousand holders: days of reconciliation become 11.1 seconds, and it is final.", {
    x: M + 0.15, y: 3.35, w: W - 2 * M - 0.3, h: 0.62, fontFace: "Segoe UI", fontSize: 16, bold: true, color: GREEN, valign: "middle",
  });
  s.addText("A realistic run, one payment per holder, reaches Canton's 10 MB transaction budget near 6,400 holders.", {
    x: M, y: 4.15, w: W - 2 * M, h: 0.4, fontFace: "Segoe UI", fontSize: 14, color: INK,
  });
  s.addText("Method, the second ceiling, and where each figure comes from: docs/benchmark.md", {
    x: M, y: 4.62, w: W - 2 * M, h: 0.3, fontFace: "Consolas", fontSize: 10, color: MUTED,
  });
  s.addNotes("Read the holders column: thirteen thousand legs was two hundred and fifty holders, not thirteen thousand. Nobody had published how many legs fit in a CIP-112 batch, so we measured it. One ceiling on the slide, the other in the repo.");
}

// ---- 11. four eyes --------------------------------------------------------
{
  const s = slide("In institutional systems, four-eyes authorisation is a requirement, not a feature.", "when one signature is not enough");
  s.addText("A run can name an approver: a decentralised party, through BitSafe's\nDecentralization Manager. One optional field; the product is unchanged without it.", {
    x: M, y: 1.75, w: W - 2 * M, h: 0.75, fontFace: "Segoe UI", fontSize: 15, color: INK, lineSpacingMultiple: 1.25,
  });
  s.addShape(p.ShapeType.rect, { x: M, y: 2.6, w: 4.1, h: 0.6, fill: { color: "FAE6E6" }, line: { color: RED, pt: 1 } });
  s.addText("One approval  →  the ledger refuses", { x: M + 0.15, y: 2.6, w: 3.8, h: 0.6, fontFace: "Segoe UI", fontSize: 15, bold: true, color: RED, valign: "middle" });
  s.addShape(p.ShapeType.rect, { x: M + 4.4, y: 2.6, w: 4.1, h: 0.6, fill: { color: "DCEFE6" }, line: { color: GREEN, pt: 1 } });
  s.addText("Two of three  →  settles", { x: M + 4.55, y: 2.6, w: 3.8, h: 0.6, fontFace: "Segoe UI", fontSize: 15, bold: true, color: GREEN, valign: "middle" });
  s.addText([
    { text: "The threshold is enforced by the ledger, not by our code. ", options: { bold: true, color: INK } },
    { text: "In the demo all three approver nodes are ours, so the threshold is real and the independence is not. On DevNet the second node is BitSafe's, and that is the version that counts, and slide 13 says where it stands.", options: { color: MUTED } },
  ], { x: M, y: 3.45, w: W - 2 * M, h: 0.95, fontFace: "Segoe UI", fontSize: 13, lineSpacingMultiple: 1.25 });
  s.addNotes("Real paying agents have four-eyes controls; this is a procurement requirement, not a nice-to-have. Below the threshold it is not our code being careful, it is the ledger refusing. And be straight about the independence: three nodes on one machine are three nodes on one machine.");
}

// ---- 12. honesty ----------------------------------------------------------
{
  const s = slide("Real, simulated, planned", "what we are not claiming");
  s.addText([
    { text: "Real   ", options: { bold: true, color: GREEN } },
    { text: "the ledger, the contracts, the settlement, the refusal, the privacy, every number on screen, the DevNet update id, the governance engine and its threshold.\n\n", options: { color: INK } },
    { text: "Simulated   ", options: { bold: true, color: AMBER } },
    { text: "the cash is TestTokenV2, the standard's own reference asset, not Canton Coin. Holders and positions are generated. Three approver nodes on one machine are not three independent operators.\n\n", options: { color: INK } },
    { text: "Not attempted   ", options: { bold: true, color: MUTED } },
    { text: "corporate-action announcement data. Chainlink, with DTCC and Swift, is attacking that layer. We do the payment layer.", options: { color: INK } },
  ], { x: M, y: 1.6, w: W - 2 * M, h: 3.2, fontFace: "Segoe UI", fontSize: 14, lineSpacingMultiple: 1.3, valign: "top" });
  s.addNotes("We would rather tell you this than have you find it.");
}

// ---- 13. what we did not build --------------------------------------------
{
  const s = slide("What we did not build", "known, designed, not yet built");
  s.addShape(p.ShapeType.rect, { x: M, y: 1.5, w: W - 2 * M, h: 1.15, fill: { color: "FFFFFF" }, line: { color: BLUE, pt: 1 } });
  s.addText([
    { text: "Scoping a run.  ", options: { bold: true, color: BLUE } },
    { text: "If 5 of 250 holders are not ready, the batch refuses for all 250. A paying agent needs to settle the 245 today and carry the 5 to a second run. The model supports it (the schedule is a list and the run is built from it), but the workflow, and the audit trail that says why five were held back, are not written.", options: { color: INK } },
  ], { x: M + 0.15, y: 1.6, w: W - 2 * M - 0.3, h: 1, fontFace: "Segoe UI", fontSize: 13, lineSpacingMultiple: 1.2 });
  bullets(s, [
    { text: "Production onboarding: holders sign the standing agreement through a real client, not a script" },
    { text: "The scheduled agent: today a person presses the button; in production a daemon watches payment dates" },
    { text: "Real cash: TestTokenV2 is the standard's reference asset; a production run settles Canton Coin or a registry's own token" },
  ], 2.85, 13);
  s.addNotes("This slide is not an apology. These are the four things we know are missing, we know how each would be built, and we would rather name them than have a judge find them. The scoping one is the first thing a paying agent would ask for.");
}

// ---- 14. what next --------------------------------------------------------
{
  const s = slide("What this becomes", "next");
  s.addShape(p.ShapeType.rect, { x: M, y: 1.5, w: W - 2 * M, h: 0.62, fill: { color: "E2F0FB" } });
  s.addText("The buyer is the independent debt paying agent and the corporate trustee, first.", {
    x: M + 0.15, y: 1.5, w: W - 2 * M - 0.3, h: 0.62, fontFace: "Segoe UI", fontSize: 15, bold: true, color: BLUE, valign: "middle",
  });
  bullets(s, [
    { text: "Dividends and redemptions are the same engine: the same run, a different event type" },
    { text: "Works against registers that already exist. The bond is not tokenized; only the cash is a Token Standard V2 asset", bold: true },
    { text: "The benchmark is a contribution in its own right: the first published figures for CIP-112 batch settlement, going to the Canton forum regardless of how this hackathon goes" },
  ], 2.35, 14);
  s.addNotes("Independent paying agents and trustees first: they carry the reconciliation cost themselves and they do not need a custodian's permission to change how they settle. The bond stays where it is, which matters commercially - the industry does not have to tokenize every instrument before any of this is useful.");
}

// ---- 15. close ------------------------------------------------------------
{
  const s = p.addSlide();
  s.background = { color: INK };
  s.addImage({ path: `${REPO}/ui/public/indivisa-logo.png`, x: M, y: 0.9, w: 1.8, h: 1.2 });
  s.addText("Indivisa", { x: M, y: 2.25, w: W - 2 * M, h: 0.8, fontFace: "Segoe UI", fontSize: 44, bold: true, color: WHITE });
  s.addText("Corporate actions, settled in one atomic batch, without exposing the register.", {
    x: M, y: 3.0, w: W - 2 * M, h: 0.5, fontFace: "Segoe UI", fontSize: 17, color: "9FB8CB",
  });
  s.addText("Settled on Canton DevNet  ·  1220652e…f466b\nRun it yourself:  cd quickstart && docker compose up", {
    x: M, y: 3.7, w: W - 2 * M, h: 0.7, fontFace: "Consolas", fontSize: 12, color: "63D3A4", lineSpacingMultiple: 1.3,
  });
  s.addText("github.com/Chain-Experts/Indivisa  ·  Apache-2.0", {
    x: M, y: 4.75, w: W - 2 * M, h: 0.3, fontFace: "Consolas", fontSize: 11, color: MUTED,
  });
  s.addNotes("One transaction. Every holder paid at the same instant, or nobody. And no holder sees another.");
}

await p.writeFile({ fileName: `${REPO}/docs/Indivisa-pitch.pptx` });
console.log("wrote docs/Indivisa-pitch.pptx, 15 slides");
