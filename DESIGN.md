---
name: Why So High
description: An electricity bill explained cause by cause, each step of the agents' reasoning printed as a flight coupon in a ticket wallet.
colors:
  cover-navy: "oklch(30% .09 262)"
  void-red: "oklch(52% .2 27)"
  carbon-violet: "oklch(42% .12 300)"
  carbon-paper: "oklch(95% .025 300)"
  confidence-amber: "oklch(85% .12 80)"
  wallet-ground: "oklch(93% .015 262)"
  coupon-white: "oklch(98.5% .004 260)"
  ink: "oklch(22% .03 262)"
  ink-muted: "oklch(40% .03 262)"
  perforation-line: "oklch(84% .02 262)"
  on-navy: "oklch(95% .012 262)"
  on-navy-muted: "oklch(82% .03 262)"
  bar-track: "oklch(91% .015 262)"
  table-head: "oklch(96% .01 262)"
  void-wash: "oklch(96.5% .02 27)"
  memory-wash: "oklch(96.5% .02 300)"
typography:
  display:
    fontFamily: "Barlow Condensed, Libre Franklin, sans-serif"
    fontSize: "80px"
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: "-0.01em"
    fontFeature: "tnum, lnum"
  amount:
    fontFamily: "Barlow Condensed, Libre Franklin, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum, lnum"
  headline:
    fontFamily: "Barlow Condensed, Libre Franklin, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.005em"
  statement:
    fontFamily: "Libre Franklin, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Libre Franklin, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Libre Franklin, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "tnum, lnum"
  body-small:
    fontFamily: "Libre Franklin, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  stub-label:
    fontFamily: "Libre Franklin, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.06em"
  route-label:
    fontFamily: "Barlow Condensed, Libre Franklin, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.06em"
  stamp:
    fontFamily: "Barlow Condensed, Libre Franklin, sans-serif"
    fontSize: "38px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.08em"
  code:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "14px"
    fontWeight: 400
rounded:
  hairline: "4px"
  pill: "6px"
  card: "8px"
  switch: "16px"
  pin: "50%"
spacing:
  tight: "4px"
  stack: "12px"
  card-x: "22px"
  card-y: "18px"
  block: "28px"
  gutter: "32px"
  column: "56px"
  section: "104px"
  page-end: "120px"
components:
  coupon:
    backgroundColor: "{colors.coupon-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "18px 22px 18px 20px"
  coupon-stub:
    backgroundColor: "{colors.coupon-white}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.stub-label}"
    padding: "18px 18px 18px 22px"
    width: "196px"
  critic-check:
    backgroundColor: "{colors.coupon-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px 18px"
  critic-check-void:
    backgroundColor: "{colors.void-wash}"
    textColor: "{colors.void-red}"
    rounded: "{rounded.card}"
  stamp-void:
    textColor: "{colors.void-red}"
    typography: "{typography.stamp}"
    rounded: "{rounded.pill}"
  stamp-validated:
    textColor: "{colors.cover-navy}"
    rounded: "{rounded.pill}"
  memory-note:
    backgroundColor: "{colors.carbon-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px 22px"
  memory-switch-on:
    backgroundColor: "{colors.carbon-violet}"
    rounded: "{rounded.switch}"
    width: "56px"
    height: "32px"
  memory-switch-off:
    backgroundColor: "oklch(78% .02 262)"
    rounded: "{rounded.switch}"
    width: "56px"
    height: "32px"
  change-pill:
    backgroundColor: "{colors.coupon-white}"
    textColor: "{colors.void-red}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
  confidence-badge:
    backgroundColor: "{colors.confidence-amber}"
    textColor: "{colors.cover-navy}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
  tab:
    textColor: "{colors.on-navy-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "14px 18px 16px"
    height: "48px"
  tab-selected:
    textColor: "{colors.on-navy}"
  comparison-table:
    backgroundColor: "{colors.coupon-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px 16px"
  evidence-accordion:
    backgroundColor: "{colors.coupon-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px 18px"
    height: "56px"
  action-card:
    backgroundColor: "{colors.coupon-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px 22px"
  button:
    backgroundColor: "{colors.wallet-ground}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.card}"
    padding: "13px 18px"
    height: "48px"
---

# Design System: Why So High

## Overview

**Creative North Star: "The Jet-Age Ticket Wallet"**

Every step of the agents' reasoning is printed as a flight coupon. A navy cover holds the route of the bill (FROM one total TO the next) in tall condensed figures, and below it the wallet opens: white coupons on a pale blue-grey ground, each with a perforated stub on the right that names the agent who worked out or checked that line and the source it used. The critic's trail sits beside the coupons as its own column of tickets, and a rejected pass is stamped VOID in red while the re-issued pass is stamped VALIDATED in navy. Anything that came from the household's memory is printed on violet carbon paper.

The screen is calm and readable for a 71-year-old reader with the paper bill beside her: body text at 18px, amounts large and tabular, every dollar paired with kWh or a unit, and color never the only signal (each amount also carries a verb such as Added, Took off or No change). Density is moderate. Space is grouped tight inside a coupon and opened wide between areas, from 4px inside a figure stack to 104px between the reasoning and the evidence.

The world was chosen on 22 Oct 2026 as direction C of three (seed key 835f0fee). The build matches the contract on palette, type pairing, coupon stub, stamps and carbon violet. Where the build differs from the contract, this file records the build.

**Key Characteristics:**
- Navy cover over a pale blue-grey wallet ground; coupon-white cards carry all content.
- Barlow Condensed for figures, route labels, area titles and stamps; Libre Franklin for everything a person reads as a sentence; IBM Plex Mono only for identifiers and SQL.
- Perforation as structure: dashed rules and punched half-circle notches separate a coupon from its stub.
- Two stamps, VOID and VALIDATED, are the only rotated elements in the system.
- Carbon violet is reserved for household memory.
- Phosphor Light icons on every cause, check, evidence row and action.

## Colors

A cool navy and blue-grey paper palette with one hot red for money going up and for rejection, and one violet reserved for memory.

### Primary
- **Cover Navy** (`cover-navy`): the cover band behind the route, the VALIDATED stamp and its card ring, money going down (amounts, bars, the down change pill), the selected-coupon pins on the timeline, icon color on coupons and action cards, links.

### Secondary
- **Void Red** (`void-red`): money going up (amounts, bars, the up change pill), the rejected critic check (ring, status, VOID stamp, "sent back" line), the selected-tab underline, and the global focus outline (3px solid, 3px offset). A lighter tint, oklch(78% .14 27), is used only for the critic-note icon on navy.
- **Void Wash** (`void-wash`): the background of a rejected critic check.

### Tertiary
- **Carbon Violet** (`carbon-violet`): household memory. The memory note label and icon, the switch track when on, the "With the note" table column, the ring on a coupon whose cause came from the note, and the dashed "Preview" chip on the actions area.
- **Carbon Paper** (`carbon-paper`): the memory note background. **Memory Wash** (`memory-wash`) shades comparison rows that change when the note is used.
- **Confidence Amber** (`confidence-amber`): only the confidence level badge (LOW) on the cover. Single use.

### Neutral
- **Wallet Ground** (`wallet-ground`): page background, notch fill, code chip background, secondary button background.
- **Coupon White** (`coupon-white`): every card surface (coupon, check, accordion, action card, table, reading panel) and the change pill on navy.
- **Ink** (`ink`) and **Ink Muted** (`ink-muted`): primary and secondary text. Muted carries stub text, detail lines, kWh, captions.
- **Perforation Line** (`perforation-line`): dashed perforations and button borders.
- **On Navy** (`on-navy`) and **On Navy Muted** (`on-navy-muted`): text on the cover. Translucent on-navy (8% fill, 25% border) builds the confidence panel; 20% builds the tab baseline.
- **Bar Track** (`bar-track`) and **Table Head** (`table-head`): the empty track behind cause bars and the comparison table header row.

### Named Rules
**The Direction Has a Color Rule.** Red means the bill went up or a pass was rejected; navy means it went down or was accepted. Every colored amount also carries a sign and a verb, so color is never the only carrier.

**The Carbon Is Memory Rule.** Violet appears only on things that came from what the household told HouseholdMemory, plus the preview chip. Do not use it as a general accent.

## Typography

**Display Font:** Barlow Condensed 500/600/700 (fallback Libre Franklin, sans-serif)
**Body Font:** Libre Franklin 400/500/600/700 (fallback sans-serif)
**Label/Mono Font:** IBM Plex Mono 400, for table names, run IDs, tariff labels and SQL

**Character:** Barlow Condensed reads like the printed figures on a ticket or a departures board; Libre Franklin keeps sentences warm and plain at large sizes. All numbers are tabular and lining (`font-variant-numeric: tabular-nums lining-nums` on body).

### Hierarchy
- **Display** (Barlow Condensed 600, 80px, line-height 0.9, -0.01em; 50px under 640px): the FROM and TO bill totals on the cover only.
- **Amount** (Barlow Condensed 600, 40px, line-height 1; 48px on bill coupons; 34px and 38px under 640px): the dollar figure on each coupon. Action amounts use 32px.
- **Headline** (Barlow Condensed 600, 36px, line-height 1.05; 30px under 640px): area titles such as "How the change adds up". The table caption, failure title and brand use the same face at 30px.
- **Statement** (Libre Franklin 600, 30px, line-height 1.3; 24px under 640px): the cover sentence "Your bill went up ... Here is why." It is the h1.
- **Title** (Libre Franklin 600, 19-20px, line-height 1.3): coupon causes, check titles, action names, the memory reading.
- **Body** (Libre Franklin 400, 18px, line-height 1.55): base text. Card body copy is 17px. Meta lines and captions sit at 15-16px.
- **Stub label** (Libre Franklin 600, 14px, 0.06em, uppercase in the markup): the field names on a stub (READ BY, CHECKED BY, WORKED OUT BY, FROM YOUR NOTE, SOURCE). Route labels FROM and TO use Barlow Condensed 600 at 22px, 0.06em.
- **Code** (IBM Plex Mono 400, 13-15px): identifiers inside stubs and evidence.

### Named Rules
**The Condensed Is For Figures Rule.** Barlow Condensed sets numbers, the route labels, area titles and stamps. Sentences, even short ones, stay in Libre Franklin.

**The 14px Floor Rule.** Reading text never drops below 14px. The only smaller text is the 13px SQL block in evidence and the 12px RE-ISSUED line inside the VALIDATED stamp.

## Layout

A centered column, max 1280px with 32px side padding (16px under 640px). The cover band is full-bleed navy. Under the topbar sit two tabs (one per bill), then the route: a two-column grid (flexible, 360px) with the FROM and TO legs and the headline on the left and the confidence panel aligned to the bottom right.

Main content runs in two grids. The upper grid is 1.6fr / 1fr with a 56px gap: the coupon timeline on the left, the critic trail on the right. In the October view the memory note, switch and reading sit above it (max 860px) and the comparison table follows the timeline. The lower grid is 5fr / 7fr with a 64px gap and 104px above it: evidence on the left, actions on the right. Main padding is 64px top, 120px bottom.

The timeline is an ordered list with a 2px dashed navy spine at 40% opacity and 14px pins; bill coupons have filled pins, cause coupons hollow ones. Cards in a list are separated by 12px.

Breakpoints: at 1020px both grids and the route collapse to one column (lower grid margin becomes 72px). At 640px the coupon stub moves below the main part with a horizontal perforation, the timeline spine and pins are hidden, the plane arrow between legs disappears, stamps move to the top left of the check, and actions stack. At 420px the coupon amount drops under the text.

## Elevation & Depth

Paper on a table. Cards are lifted by one shared shadow, a 1px tinted base line plus a soft navy drop; there is no other elevation level. State is expressed with rings (a 0 0 0 Npx spread shadow) layered on that shadow, never by lifting higher. All shadow color is navy or the card's own hue, never black.

### Shadow Vocabulary
- **Card on table** (`box-shadow: 0 1px 0 oklch(82% .025 262), 0 10px 22px -12px oklch(30% .09 262 / .38)`): every coupon, check, accordion, action card, table and reading panel.
- **Validated ring** (`box-shadow: 0 0 0 2px oklch(30% .09 262), <card on table>`): the accepted check that carries the VALIDATED stamp.
- **Void ring** (`0 0 0 2px oklch(52% .2 27)` with a red-tinted drop `0 10px 22px -12px oklch(52% .2 27 / .4)`): the rejected check.
- **Memory ring** (`0 0 0 1.5px oklch(42% .12 300 / .45), <card on table>`): a coupon whose cause came from the household note. The memory note itself uses the ring at 35% with no drop.
- **Switch knob** (`0 1px 3px oklch(30% .09 262 / .35)`).

### Named Rules
**The One Lift Rule.** There is one card shadow. Emphasis is a ring, not a bigger shadow.

## Shapes

One corner radius for every card, tab top and button (8px). Small inline pills and stamps use 6px, bars and code chips 4px, the switch track 16px, pins and notches are circles. Borders are rare: dashed 2px perforation lines, a dashed 1.5px violet preview chip, a 1.5px sample badge on navy and the 3px stamp border.

The recurring silhouette is the punched ticket: a 14px circle in the ground color cut out at the top and bottom of the perforation line between coupon and stub (and at both ends of the action-card stub), so the card reads as a coupon with a tear-off. On mobile the notches move to the two ends of the horizontal perforation, drawn with radial gradients.

## Components

### Coupon (cause and bill)
Ticket paper with a tear-off stub. The heart of the system.
- **Structure:** a two-column grid, main part flexible and stub 196px, coupon-white, 8px radius, card-on-table shadow. The main part is a three-column grid: 28px Phosphor icon in navy, title and detail, amount block on the right (amount, signed kWh, verb). An 8px bar under the text shows the share of the change, `scaleX(--w)` from the left, red for up and navy for down; price and unexplained coupons have no bar.
- **Stub:** separated by a 2px dashed perforation with two punched notches. Holds the stub label (role), the agent name (600, not translated) and the source line.
- **Bill variant:** the first and last coupons are the two bills; 48px navy amount, filled timeline pin, stub "READ BY BillReader".
- **Memory variant:** cause from the household note gets the memory ring and a violet icon.
- **Zero:** amounts at $0.00 render in ink-muted.
- **Stacking:** list items use a -4px bottom margin and every even coupon shifts 6px right, intended as overlapping tickets in a wallet. In the render they read as stacked cards touching edge to edge, not as overlapping coupons. The 640px breakpoint removes both and uses a 10px gap.

### Critic check
A column of numbered tickets showing what ReconciliationCritic accepted and rejected.
- **Structure:** coupon-white card, 16px 18px padding, two-column grid: the number (Barlow Condensed 22px, ink-muted) and the content (status line with Phosphor seal-check or x-circle, title, text, optional meta).
- **Accepted:** navy status text, no ring.
- **Rejected:** void-wash background, void ring, red status and a "Sent back to <agent> to try again" line with an arrow icon. Carries the **VOID stamp**: Barlow Condensed 700 at 38px, 0.08em, 3px red border, 6px radius, rotated -11deg, top right.
- **Re-issued and accepted:** validated ring and the **VALIDATED stamp**: 21px navy, rotated -7deg, with a 12px RE-ISSUED line above.
- **Target:** each check has an id and is reachable from the cover's critic note link; on `:target` or focus it gets a 3px red outline at 4px offset.
- Stamps are `aria-hidden`; the status line carries the meaning in text.
- Under the list, a ruler-icon line states the thresholds the critic uses.

### Memory note and switch
- **Note:** carbon-paper card, 20px 22px, memory ring at 35%. Notebook icon, a violet 15px label naming who told HouseholdMemory and when, then the quote as a 20px blockquote.
- **Switch:** a `role="switch"` button, 48px tall. Track 56 x 32px, radius 16px, oklch(78% .02 262) off and carbon violet on; 24px coupon-white knob slides 24px. Label plus an On/Off word (violet when on, ink-muted when off). Hover darkens the track.
- **Reading:** a coupon-white panel under the switch. "With the note" in navy with seal-check, "Without the note" in red with warning.

### Comparison table
"Same bill, with and without the note." Coupon-white, 8px radius, card shadow, 17px. Caption in Barlow Condensed 30px. Header row on table-head, 15px 700 ink-muted, the "With the note" header in violet. Row headers left, amounts right-aligned and tabular with kWh in a 15px second line. Rows that change get the memory wash; missing causes read "Not shown" in italic ink-muted. A note under the table explains the shading.

### Evidence accordion
Native `details` elements styled as coupons, 12px apart. Summary 56px tall with a Phosphor icon, title and a caret that rotates 180deg (200ms). Body is indented 52px (18px on mobile), 17px ink-muted, with mono code chips on the ground color and SQL in a `pre` block. Outbound links carry an arrow-square-out icon and turn red on hover.

### Action card with source stub
Help the household could ask for, in two columns (one under 640px). Coupon-white, 20px 22px. Title with a 26px navy icon, the full program name in ink-muted, body text and the amount in Barlow Condensed 32px navy. The bottom is a source stub: a 2px dashed perforation spanning the card edge to edge with punched notches at both ends, a SOURCE label and an outbound link. The area header carries a dashed violet "Preview, amounts to be confirmed" chip.

### Cover pieces
- **Tabs:** transparent on navy, 18px 600, 48px tall, top corners 8px. Hover lifts the text to on-navy with a 7% fill; the selected tab gets a 4px red underline inset 12px. Focus outline switches to on-navy.
- **Change pill:** coupon-white inline pill with arrow icon and amount, red when up, navy when down.
- **Confidence panel:** translucent navy-light panel with a gauge icon and the amber level badge (Barlow Condensed 700, 26px).
- **Critic note:** an underlined link under the headline with a light red x-circle, pointing to the rejected check.

### Buttons
Only the retry button on the failure card is live: 48px, 8px radius, 1.5px perforation-line border, 17px 600, icon plus label; hover turns the border navy. A disabled style exists but no disabled button ships.

### Loading and failure
Skeleton coupons (96px, 14px lines on oklch(90% .015 262), pulsing 1.2s) with a plane icon and a plain sentence; skeleton bars on the cover use on-navy at 14%. Failure is a coupon-white card with a red Barlow title and the retry button.

### Motion
One easing, `cubic-bezier(0.23, 1, 0.32, 1)`. Coupons and checks rise in (opacity plus 6px translate, 240ms, delay 180ms plus 30ms per item, index capped at 7). Bars grow with `scaleX` (280ms, 260ms plus 70ms per item). Stamps thump in from scale 1.25 (220ms, at 420ms; VALIDATED at 520ms). Caret and switch transitions run 200ms. `prefers-reduced-motion: reduce` turns all of it off.

### Known gaps in the build
- The coupons do not visually overlap. The -4px margin and 6px shift on even coupons are in the stylesheet, but the render shows stacked cards that touch.
- The rejected check also draws a violet sheet 7px behind it (`7px 7px 0 0` carbon paper plus a 1.5px violet edge), meant as the carbon copy of the voided coupon. It is a hard offset shadow and is not part of this system; treat it as pending review, and do not reuse it.
- `--marino-2` (oklch(36% .09 262)) is declared in `:root` and never used, so it is not recorded as a token.
- The secondary button has a disabled style, but no disabled button ships.

## Do's and Don'ts

### Do:
- **Do** print every reasoning step as a coupon with a stub that names the agent and the source.
- **Do** pair every amount with a sign, a unit (kWh or $) and a verb, and keep numbers tabular.
- **Do** use red for up or rejected and navy for down or accepted, nothing else.
- **Do** keep violet for what came from household memory.
- **Do** use the one card shadow and express emphasis with a 1.5-2px ring.
- **Do** keep reading text at 17-18px Libre Franklin and touch targets at 44-48px.
- **Do** use Phosphor Light icons on causes, checks, evidence rows, actions and states.

### Don't:
- **Don't** rotate anything except the VOID and VALIDATED stamps.
- **Don't** set sentences in Barlow Condensed.
- **Don't** let color carry meaning alone; the status text and verbs must say it too.
- **Don't** introduce a second card radius or a second card shadow.
- **Don't** use emojis anywhere.
