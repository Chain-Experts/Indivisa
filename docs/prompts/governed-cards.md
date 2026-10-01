# Prompt for Claude Desktop: the six governed-settlement title cards

Paste everything in the block below into Claude Desktop.

It builds a new six-card deck for the governed-settlement video described in
[`../demo-script-governed.md`](../demo-script-governed.md), starting from the
existing deck so the look matches exactly.

---

````text
I need a new six-slide PowerPoint deck of title cards, built from an existing
deck so the styling matches exactly.

START FROM THIS FILE
D:\Dev\ChainExperts\Indivisa-recording\cards.pptx

Open it and immediately Save As:
D:\Dev\ChainExperts\Indivisa-recording\governed-cards.pptx

Work only in the new file. Do not modify cards.pptx.

WHAT THESE CARDS ARE
Title cards that sit between video clips in a 90-second demo video. They are
not a presentation. Each is on screen for 3 to 6 seconds between shots of a
live application, so they are deliberately plain: one headline, one
supporting line, nothing else.

The video shows a bond coupon that one company cannot pay on its own. The
paying agent presses its own button and the ledger refuses, because the
payment needs a second company to agree. That second company is BitSafe, a
real organisation running their own node. They agree, and the payment goes
through.

HOW TO BUILD IT
The existing deck has 8 slides. Keep slide 4 as a styling reference, delete
everything else, then duplicate slide 4 seven times and replace the text. That
guarantees identical fonts, sizes, colours and margins.

Slide 4 has exactly the shape these need: a bold headline over one
supporting line.

Do not design a new layout. Do not adjust spacing "to look better". These sit
in a sequence and consistency matters more than any single slide.

THE SEVEN SLIDES, TEXT EXACTLY

Slide 1
  Headline:    Indivisa
  Supporting:  A coupon that one company cannot pay on its own.
  Third line (smaller, like slide 1 of the original deck):
               Chain-Experts · HackCanton Season 3
  Note: the original slide 1 puts the product name in green (#1E6B48) at a
  larger size. Match that treatment here.

Slide 2
  Headline:    A bond coupon. Five holders. One paying agent.
  Supporting:  And an approver: a party no single company controls.

Slide 3
  Headline:    The agent cannot settle this alone.
  Supporting:  So it asks. The button files a request, not a payment.

Slide 4
  Headline:    Two approvers. One of them is not ours.
  Supporting:  BitSafe run the second node, on their own machine.

Slide 5
  Headline:    One approval is not enough.
  Supporting:  At one of two, there is nothing to press.

Slide 6
  Headline:    Both agreed. One transaction. Five holders paid.
  Supporting:  Settled on Canton DevNet.
  Third line (smaller, grey):
               splice-test-token-v2 stands in for the cash. The model never
               names the asset.

Slide 7
  Headline:    This console settles. It does not keep the register.
  Supporting:  Holders, positions and the schedule come from systems a paying
               agent already runs. Here a script stands in for them.

DECK CONVENTIONS, inherited from the original
- Widescreen 16:9, solid background #F6F7F3
- Text #1B2622, green accent #1E6B48 used only for the product name
- One font throughout (whatever the original uses)
- Headline bold, supporting line noticeably smaller
- Left aligned, generous left margin
- No clip art, no animations, no transitions, no slide numbers

THEN EXPORT THE PNGs
File → Export → Change File Type → PNG Portable Network Graphics →
Save As → create and choose the folder
D:\Dev\ChainExperts\Indivisa-recording\governed-cards →
file name "cards" → when asked which slides, choose All Slides.

The result must be Slide1.PNG through Slide7.PNG, each 1920x1080.

CHECK BEFORE YOU FINISH
- governed-cards.pptx has exactly 7 slides
- cards.pptx is untouched
- All seven PNGs exist at 1920x1080
- Fonts, sizes and margins match the original deck
- Slide 6's third line is present and smaller than the supporting line

Tell me what you changed and confirm the export.
````

---

## Why each card says what it says

**Slide 1** names the product and the problem in one line. A viewer who
watches nothing else knows what it is about.

**Slide 2** sets up the run and introduces the approver *before* anything
happens, so the refusal that follows is not a surprise.

**Slide 3** was rewritten on 1 October. The first version said the agent
presses its button and the ledger refuses. That stopped being true when the
console learned to file a proposal instead of attempting a payment: the agent
still cannot settle alone, but nothing is refused, because nothing is tried.
The card now says what actually happens.

**Slide 4** is the claim the whole film exists for, and the word that carries
it is **not ours**. Avoid softening it.

**Slide 5** carries the refusal that survives, and it is the better one: at
one of two there is no error message, there is simply no button. "Below the
threshold, nothing moves" was replaced by "At one of two, there is nothing to
press" because the second describes the screen.

**Slide 6** closes the settlement, and its small third line is the honesty
disclosure. It must not be dropped to save room: the cash is a stand-in and
the film says so.

**Slide 7** is the last card in the film, after the proof. It answers the
question a judge asks the moment the settlement succeeds - what was off
camera? The reset that prepares the run is a script, and the register, the
positions and the schedule would come from systems a paying agent already
operates. Ending on that is deliberate; see docs/production-readiness.md for
the full account.

## If you would rather not use Claude Desktop

Every instruction above can be done by hand in PowerPoint in about twenty
minutes. The only part that matters is starting from `cards.pptx` and
duplicating an existing slide, so the two decks look like one deck.
