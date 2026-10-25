---
name: Why So High
description: An electricity bill explained cause by cause, set like a forecast office's daily report for Columbus, with the real daily weather as the visible backbone.
colors:
  ground: "oklch(97.5% .008 230)"
  surface: "oklch(99.2% .004 230)"
  band: "oklch(94.5% .014 235)"
  line: "oklch(24% .03 245 / .12)"
  line-strong: "oklch(24% .03 245 / .24)"
  ink: "oklch(24% .03 245)"
  ink-2: "oklch(40% .03 245)"
  service: "oklch(38% .09 245)"
  service-deep: "oklch(31% .08 245)"
  link: "oklch(41% .11 245)"
  on-service: "oklch(97.5% .008 230)"
  on-service-2: "oklch(86% .03 235)"
  heat: "oklch(66% .16 45)"
  heat-ink: "oklch(48% .14 42)"
  cold: "oklch(62% .11 235)"
  cold-ink: "oklch(44% .11 240)"
  reject: "oklch(55% .19 25)"
  reject-ink: "oklch(46% .18 25)"
  reject-bg: "oklch(95.5% .028 25)"
  on-reject: "oklch(98% .01 25)"
  temp-1: "oklch(48% .12 245)"
  temp-2: "oklch(60% .11 235)"
  temp-3: "oklch(68% .07 200)"
  temp-4: "oklch(70% .11 75)"
  temp-5: "oklch(64% .15 50)"
  temp-6: "oklch(55% .17 35)"
typography:
  change-figure:
    fontFamily: "Public Sans, Atkinson Hyperlegible Next, sans-serif"
    fontSize: "108px"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.04em"
    fontFeature: "tnum, lnum"
  headline:
    fontFamily: "Public Sans, Atkinson Hyperlegible Next, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.017em"
  section-title:
    fontFamily: "Public Sans, Atkinson Hyperlegible Next, sans-serif"
    fontSize: "31px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  card-title:
    fontFamily: "Public Sans, Atkinson Hyperlegible Next, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  action-figure:
    fontFamily: "Public Sans, Atkinson Hyperlegible Next, sans-serif"
    fontSize: "44px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tnum, lnum"
  amount:
    fontFamily: "Public Sans, Atkinson Hyperlegible Next, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: "tnum, lnum"
  title:
    fontFamily: "Public Sans, Atkinson Hyperlegible Next, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.008em"
  body:
    fontFamily: "WSH Figures, Atkinson Hyperlegible Next, Public Sans, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "tnum, lnum"
  body-small:
    fontFamily: "WSH Figures, Atkinson Hyperlegible Next, Public Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  control:
    fontFamily: "Public Sans, Atkinson Hyperlegible Next, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1
  chart-label:
    fontFamily: "Public Sans, Atkinson Hyperlegible Next, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.25
  code:
    fontFamily: "Atkinson Hyperlegible Mono, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  box: "4px"
  mark: "2px"
  bar: "1px"
  pill: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
  s9: "96px"
components:
  shell:
    backgroundColor: "{colors.service}"
    textColor: "{colors.on-service}"
  tab:
    textColor: "{colors.on-service-2}"
    typography: "{typography.control}"
    rounded: "{rounded.box}"
    padding: "14px 14px 15px"
    height: "48px"
  tab-selected:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.service-deep}"
  box:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.box}"
    padding: "16px"
  action-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.box}"
    padding: "32px"
  button-solid:
    backgroundColor: "{colors.service}"
    textColor: "{colors.on-service}"
    typography: "{typography.control}"
    rounded: "{rounded.box}"
    padding: "10px 16px"
    height: "44px"
  button-solid-hover:
    backgroundColor: "{colors.service-deep}"
  button-line:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.link}"
    typography: "{typography.control}"
    rounded: "{rounded.box}"
    padding: "10px 16px"
    height: "44px"
  button-line-hover:
    backgroundColor: "{colors.band}"
  weather-toggle-pressed:
    backgroundColor: "{colors.service}"
    textColor: "{colors.on-service}"
    rounded: "{rounded.box}"
    padding: "8px 12px"
    height: "40px"
  status-chip:
    backgroundColor: "{colors.band}"
    textColor: "{colors.ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.box}"
    padding: "6px 10px"
  check-rejected:
    backgroundColor: "{colors.reject-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.box}"
  check-rejected-head:
    backgroundColor: "{colors.reject-ink}"
    textColor: "{colors.on-reject}"
    padding: "8px 16px"
  switch-track-off:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    width: "56px"
    height: "32px"
  switch-track-on:
    backgroundColor: "{colors.service}"
    rounded: "{rounded.pill}"
    width: "56px"
    height: "32px"
  thumb-tag:
    backgroundColor: "{colors.service}"
    textColor: "{colors.on-service}"
    rounded: "{rounded.mark}"
    padding: "5px 8px"
---

# Design System: Why So High

## Overview

**Creative North Star: "The Forecast Office"**

The page reads like a weather service's daily report for Columbus. A full-bleed service-blue bar carries the brand and the two bill tabs; under it, on a cool pale ground, the change in the bill is set at forecast-headline scale, and the real daily temperatures of both billing periods run as a chart of one bar per day. Everything else is set as plain report furniture: ruled lists, a few bordered boxes, tabular figures, and short sentences for a reader of 71 with the paper bill beside her.

Density is moderate and calm. Running text is 18px (17px on phones) and never drops below 16px; only chart labels go to 14px. Colors are few and each has a job: service blue for the shell and the system's marks, a warm/cool pair for the direction of money, a six-step temperature scale for the weather bars, and one red for the checker's rejection. Surfaces are flat: there are no shadows.

This file was written from the shipped build of `web/index.html` (styles in `web/src/styles.css`, markup in `web/src/view.ts`) on 25 Oct 2026. It replaces the 22 Oct record of an earlier direction (the ticket wallet); none of that system is in the build. The earlier files are kept in `.impeccable/` as `DESIGN.superseded-2026-10-22.md` and `design.superseded-2026-10-22.json`. The rendered page was not inspected for this record; where a claim depends on the render, it says so.

**Key Characteristics:**
- Service-blue shell over a cool pale ground; one 4px corner radius for every box.
- Public Sans for headings and figures, Atkinson Hyperlegible Next for sentences, Atkinson Hyperlegible Mono only for SQL and identifiers.
- Digits inside sentences come from a self-hosted Public Sans subset ("WSH Figures"), so no slashed zero reaches the reader.
- The weather strip, one bar per day colored by that day's average temperature, is the signature component.
- Flat surfaces: 1px borders and ruled lines, no shadows.
- Phosphor Light icons on causes, agents, checks, actions, evidence rows and states.
- Agents carry plain names on screen; code names appear only in the evidence area.

## Colors

A cool blue-grey report palette with one service blue, a warm and a cool ink for the direction of money, a six-step temperature scale for weather, and one red reserved for rejection.

### Primary
- **Service Blue** (`service`): the shell bar behind the brand and tabs, the solid button, the switch track when on, the pressed weather toggle, the "on" segment of the confidence meter, the ring drawn around the total on the bill thumbnail and its "Sample" tag, the bill markers in the running-total column, the 65°F base line and the bill shading on the weather chart, the noted-month bracket, the live-column underline in the comparison table, the "Accepted" status in the checks, and the icon color on causes, agents, action titles and evidence rows. Section headings themselves are set in Ink, so "section ink" in practice means icons and marks, not heading text.
- **Service Deep** (`service-deep`): the selected tab's text and the solid button's hover.
- **Link Blue** (`link`): links, line buttons, the chart's text buttons and the "Open it full size" cue.
- **On Service** (`on-service`) and **On Service Muted** (`on-service-2`): text on the shell. Muted carries the household name and unselected tabs.

### Secondary
- **Heat** (`heat`) and **Heat Ink** (`heat-ink`): money added. Heat fills the upward segments of the running-total column and the phone running-total chart; Heat Ink colors added amounts in the cause table and the up arrow beside the change figure. Heat also fills the mercury of the logo. Heat Ink is also the global focus ring (see the rule below).
- **Cold** (`cold`) and **Cold Ink** (`cold-ink`): money taken off, in the same places, and the down arrow beside the change figure.

### Tertiary
- **Temperature scale** (`temp-1` to `temp-6`, cool blue through teal and amber to brick): the fill of each day's bar on the weather strip, by average temperature: under 60°F, 60 to 65, 65 to 70, 70 to 75, 75 to 80, 80 and up. The same six swatches appear in the strip's mini scale and its legend. Nothing else uses them.
- **Rejection Red** (`reject-ink`, `reject-bg`, `on-reject`): the rejected check only. Reject Ink fills its header bar and colors its number and the "Sent back to ... to try again" line; Reject Background fills the check; On Reject is the header text. `reject` is the base hue: it appears only as a literal at 55% opacity on the rejected check's border, never through the custom property.

### Neutral
- **Ground** (`ground`): the page background and the selected tab, so the selected tab reads as part of the page.
- **Surface** (`surface`): every bordered box (weather strip, cause table, comparison table, note panel, action cards, bill thumbnail, dialog, failure card), the switch track when off, and form fields.
- **Band** (`band`): table header rows, the rule box under the checks, status chips, hover fills on line and text buttons, the off segment of the meter, changed rows in the comparison table, the noted month on the chart, skeletons and the footer.
- **Ink** (`ink`) and **Ink Muted** (`ink-2`): primary and secondary text. Muted carries dates, sources, kWh lines, captions and the previous bill's amount.
- **Line** (`line`) and **Line Strong** (`line-strong`): Line draws box borders, table rules and list rules; Line Strong draws control borders, the thumbnail border, the chart baseline and the confidence divider.

### Named Rules
**The Weather Owns The Scale Rule.** The six temperature steps color weather bars and their legend, nothing else. Money uses Heat and Cold, which are separate tokens.

**The Direction Has A Temperature Rule.** Added money is warm, money taken off is cool, and the change figure itself stays Ink; only its arrow takes the color. Every colored amount also carries a sign and a verb (Added, Took off, No change, Nothing left), so color is never the only signal.

**The One Rejection Rule.** Rejection red marks the checker's rejection and nothing else.

**Where the build breaks these rules.** Recorded here so they are not copied:
- The global focus ring (`:focus-visible`, 3px solid) and the `:target` outline on checks and action cards use Heat Ink. This is a deliberate, reused, legible choice in the build and is kept as the focus color, but it is a warm temperature ink outside money and weather, which the direction contract did not provide for.
- The shell's "Sample bill, made-up data" label is tinted with Heat at 22% and bordered with oklch(80% .1 55 / .55). That is a temperature color on the shell for a non-weather meaning. Not canonized.
- The failure card's warning icon uses Reject Ink, outside the checker's rejection. Not canonized.
- Text selection uses a warm oklch(85% .08 60). One-off, not a token.

## Typography

**Display Font:** Public Sans 400 to 800 (fallback Atkinson Hyperlegible Next, sans-serif)
**Body Font:** "WSH Figures" for digits, then Atkinson Hyperlegible Next 400/500/700 (fallback Public Sans, sans-serif)
**Label/Mono Font:** Atkinson Hyperlegible Mono 400/500, only for SQL and identifiers

**Character:** Public Sans is a plain government sans that suits a weather service report; Atkinson Hyperlegible Next keeps sentences easy to read at large sizes. Atkinson draws a slashed zero, which reads as a letter to this reader, so digits in running text are taken from Public Sans.

**WSH Figures.** A face declared in the stylesheet from the self-hosted `/fonts/public-sans-latin.woff2`, weights 400 to 800, `unicode-range: U+0030-0039` (digits only), `size-adjust: 92%` so the digits sit at the height of Atkinson's capitals, `font-display: swap`. It heads the text stack, so letters fall through to Atkinson and digits come from Public Sans. The file is preloaded in `index.html`. Public Sans itself, Atkinson Next and Atkinson Mono load from Google Fonts. Figures set on their own (amounts, the change figure) use Public Sans directly through the figure class.

**Tabular figures.** The body sets `font-variant-numeric: tabular-nums lining-nums`, and the figure class repeats it, so every number on the page is tabular and lining.

### Hierarchy
- **Change figure** (Public Sans 800, 108px, line-height 0.86, -0.04em; 72px at 760px and under): the dollar change in the headline only. The arrow beside it is 50px (36px on phones). The direction contract asked for 76 to 88px; the build ships 108px on wide screens.
- **Headline** (Public Sans 600, 30px, 1.15, -0.017em; 26px on phones): "Your bill went up", the first line of the h1. "Here is why." is the same face at 24px 600.
- **Section title** (Public Sans 700, 31px for page sections and 27px for the cause and check columns, -0.02em; 26px and 24px on phones).
- **Card title** (Public Sans 700, 25px, -0.015em; 22px on phones): action cards. The comparison and not-offered headings use 21px, the note panel 19px, the dialog 22px.
- **Action figure** (Public Sans 800, 44px, -0.03em; 32px on secondary cards; 34px and 28px on phones).
- **Amount** (Public Sans 700, 24px): the two bill totals. Cause amounts are 23px (bill rows 26px), 21px on phones.
- **Title** (Public Sans 700, 19px): cause names. Check titles are 18px.
- **Body** (Atkinson Next with WSH Figures, 18px, line-height 1.55; 17px under 760px): base text. Card body and notices use 17px.
- **Body small** (16px): captions, sources, kWh lines, check text, meter labels, chips, evidence tables. This is the floor for any text a person reads.
- **Control** (Public Sans 600, 17px): buttons. Tabs use 17px 500 (16px on phones); text buttons on the chart use the text face at 16px 500.
- **Chart label** (Public Sans 600, 14px): the averages and hottest-day labels on the weather chart, its y-axis, and the phone running-total chart. Nothing outside a chart is set at 14px.
- **Code** (Atkinson Mono 400, 16px, line-height 1.6): SQL blocks in the evidence; inline identifiers at 1em.

### Named Rules
**The 16px Floor Rule.** Running text is never below 16px. Chart labels are the only text at 14px.

**The Figures Are Public Sans Rule.** Headings and every figure, standalone or inside a sentence, are Public Sans. Sentences are Atkinson Hyperlegible Next.

**The Mono Is Evidence Rule.** Atkinson Hyperlegible Mono appears only in SQL blocks and inline identifiers (table names, station id, rate label, run id, model name, agent code names), all inside the evidence area.

## Layout

A centered column, max 1240px with 32px side padding (16px at 760px and under). The shell is full bleed.

The lead is a three-column grid (flexible, 340px, 236px; gap 24px by 40px): the headline block spans two rows on the left; the two bill totals sit in the middle column; the bill thumbnail sits on the right; the confidence block runs under both side columns. The weather strip follows the lead at full width. Then the work area: a 1.55fr / 1fr grid with a 48px gap, the cause table on the left and the checks on the right. At 1101px and wider the checks column is sticky: it scrolls with the page until its last line shows, then stays (its height is written to `--ck-h` by `main.ts`). Actions and evidence follow as full-width sections 96px apart (64px on phones). Actions use a 7fr / 5fr grid (8fr / 4fr when there is one card on the side).

Spacing runs on a nine-step scale from 4px to 96px (ratio 1:24). Inside a row, gaps are 4 to 12px; between boxes 24px; between sections 96px; the page ends with 96px of bottom padding.

Breakpoints: at 1100px the lead drops to two columns (thumbnail under the totals, confidence full width) and the work area stacks. At 860px the lead becomes one column in the order headline, totals, thumbnail, confidence; the weather strip stacks its side panel over the chart; actions stack. At 760px body text drops to 17px, tab dates hide, the chart shrinks from 180px to 140px tall and hides the hottest-day label in favor of a written summary, the cause table becomes stacked rows, its running-total column is replaced by a compact running-total chart above the table, and the bill dialog shows the bill at 900px inside a sideways scroll.

**Placement against the contract.** The contract's first viewport put the weather strip as a full-width band after the cause table and checks. The build places it directly under the lead, before the cause table. Whether the cause table and checks still start in the first viewport was not checked in a render.

## Elevation & Depth

Flat. `--shadow` is declared as `none` and no surface casts a shadow. Depth comes from the ground and surface steps (Ground, Surface, Band), 1px borders, and ruled lines. The only `box-shadow` in the build is an inset 3px service-blue underline marking the live column header in the comparison table, a rule rather than elevation. The dialog sits over a backdrop of Ink at 55%.

### Named Rules
**The Box Or Rule Rule.** A box (1px border, no shadow) holds one thing read or used as a whole: the weather chart, the cause table, an action card, the notes. Lists are ruled lines: checks, the not-offered list, evidence rows.

## Shapes

One corner radius (4px) for every box, button, chip, tab top and field. Small marks use 2px (the thumbnail tag, chart segments, brackets, skeleton lines, the focus ring corner); bars and swatches use 1px (weather bars, meter segments, legend swatches, bill markers). The switch track is a full pill and its knob a circle; the hottest-day marker and zero markers are circles. Borders are 1px solid; dashed lines mark the running-total origin, the 65°F base line, the noted month's bracket and the "checked by" footer of action cards.

**The logo.** A thermometer whose tip is an upward arrow, drawn on a 32 by 32 grid: one outlined path (stroke 2.1, round joins) forms the arrowhead, the stem and the bulb; a 2px rounded bar and a 3.2-radius circle form the mercury, filled in Heat; two short tick marks (stroke 1.7, round caps) sit to the right of the stem. In the page it is an inline SVG symbol whose outline takes `currentColor` (On Service in the shell at 28px, Service Blue in the footer at 24px) and whose mercury takes Heat through a class. The standalone files in `web/public` use fixed hex approximations: `logo-mark.svg` and `logo.svg` (mark plus the "Why So High" wordmark as outlined paths) use #09466f, #df6c32 and #13212d; `favicon.svg` puts the mark in pale #f2f8fb on a #09466f square with 6px corners. The page's `theme-color` is #09466f.

## Components

### Icons
Phosphor Light, loaded as the Phosphor web light stylesheet (version 2.1.1 from unpkg), sized at 1.15em of the surrounding text and nudged down 0.14em. Icons are decorative (`aria-hidden`); the text next to them carries the meaning. Each agent has its own icon (scan, receipt, cloud-sun, calculator, list-checks, notebook, hand-heart), each cause has one (tag, notebook, calendar-dots, thermometer-simple, plug, question), and each action has one. Icons on causes, agents, action titles and evidence rows are Service Blue; icons in the not-offered list are Ink Muted.

### Top bar and tabs
The shell holds the brand (28px mark plus a 21px 700 wordmark), the household name in On Service Muted at 16px pushed right, and the sample-data label. Below it, two tabs, one per bill, each with a file-text icon, the bill name and its dates (16px 400, hidden on phones). Unselected tabs are transparent with muted text; hover brightens the text and adds an 8% pale fill, press 14%. The selected tab takes the Ground color with Service Deep 700 text, so it joins the page below. Tab focus draws an On Service outline inset 4px; the selected tab's focus uses Heat Ink. While loading, tabs show skeleton lines and are `aria-disabled`.

### Change headline
The h1 holds "Your bill went up" (or down) and the change figure with a Phosphor arrow colored Heat Ink or Cold Ink; the number stays Ink. Under it: "Here is why." (on the second bill, the memory switch sits beside it), a notice line with a Service Blue seal-check that says the answer was checked twice and links to the rejected check, and a "Next step" line at 19px with an arrow-circle-down icon linking to the first offered action. Beside it, the two bill totals as a definition list: previous amount in Ink Muted, current in Ink, each with the bill name and its dates, then a one-line explanation of kWh.

### Bill thumbnail and dialog
A button holding an SVG that places the household's bill image and draws a Service Blue ellipse (stroke 6) around the printed total. 1px Line Strong border, 4px radius, zoom-in cursor; hover turns the border Service Blue, press scales to 0.98. A "Sample" tag (Public Sans 700, 16px, Service Blue, 2px radius) sits bottom-left. The caption says which bill and total are circled and offers "Open it full size". The dialog is a native `dialog` on Surface with a 1px border and 4px radius, up to 920px wide, with a 22px title and a line "Close" button; it shows a crop of the printed part. On phones the bill renders 900px wide in a scroll box with a "Slide the bill sideways" hint.

### Confidence meter
"How sure we are" with a gauge icon. Two segments in a 1fr / 2fr grid, 8px tall, 3px apart, 1px corners: Service Blue when reached, Band when not. Labels under them ("Low", "Higher, once we have N of your bills"); the current one is Public Sans 800 Ink, the other Ink Muted. The reason sits beside it in a second column (under it on phones). Separated from the totals by a Line Strong rule.

### Weather strip (signature)
A box with a 236px side panel and the chart. The side panel holds the title ("Columbus weather, day by day" with a cloud-sun icon), a readout of the day under the pointer (16px Ink Muted), a mini scale of the six temperature swatches between "cooler" and "hotter", a "How to read this chart" text button and a "Clear the shading" button that keeps its space while hidden.

The chart is a 180px plot (140px on phones) behind a 44px y-axis. Each day is a bar from its low to its high, filled by the temperature step of its average, 3px apart (1px on phones). The plot is a keyboard slider (`role="slider"`), with a crosshair cursor; the picked day gets a 2px Ink outline. A dashed Service Blue line at 55% marks 65°F, and the 65°F axis label is Service Blue 700. Each bill's average is a 2px Ink line at 80% with a 14px label tied to it by a dotted tick; the hottest day gets a 5px Ink dot and a 14px label (replaced by a written summary on phones). Brackets under the chart name each bill and its dates; a month the household marked as unusual gets a dashed Service Blue bracket and a Band shading on the chart. When the weather toggle in the cause table is pressed, both bills are shaded in Service Blue at 10% and 18% and the brackets thicken to 2.5px Service Blue. "How to read this chart" opens a panel with the full legend, the meaning of the lines and degree days, each bill's need, and a footer naming the Weather check.

### Cause table
A real table in a box. Header row on Band, 16px 600 Public Sans Ink Muted. Rows: the previous bill, each cause, the current bill. A cause cell holds its icon, title (19px 700), a 16px detail line and a "who" line: the agent's plain name in bold with its icon, and the source under it. The change column is right-aligned: amount in Public Sans 700 at 23px (Heat Ink when added, Cold Ink when taken off), signed kWh, and a verb with an arrow or equals icon. A 190px running-total column draws a dashed origin, a Heat or Cold segment per cause, a ring for zero, and Service Blue markers for the two bills; the caption states that the scale does not start at $0. Bill rows are tinted Band at 55%. The weather row carries a line button, "Shade both bills on the weather chart" (`aria-pressed`; pressed fills Service Blue), that shades the strip and brings it into view. On phones the table becomes stacked rows and the running-total column becomes a separate compact chart above the table.

### The checker's checks
Introduced by a line naming The checker with its icon. Checks are a ruled ordered list grouped by pass ("First pass", "Second pass, after <agent> tried again"). Each check has a 28px number column (Public Sans 700, 19px, Ink Muted), a status line ("Accepted", Service Blue with check-circle), an 18px title and 16px text. The rejected check becomes a box: Reject Background fill, a red border at 55%, 4px radius, a Reject Ink header bar reading "Rejected, first pass" with a warning-octagon icon, a Reject Ink number and a bold Reject Ink "Sent back to ... to try again" line. A Band box under the list states the checker's thresholds with a ruler icon. Checks are link targets; on `:target` or focus they get a 3px Heat Ink outline.

### Action cards
The first offered action is the primary card (left column, Line Strong border); others stack on the right. A card is a box with 32px padding (24px on phones): a 25px title with a Service Blue icon, the program's full name, a 17px body, the amount at 44px (32px on secondary cards) with its context, a "fits" line, a "Next step." line, buttons (solid "Apply or read more" opening in a new tab, line button with the phone number) and a footer under a dashed rule naming who checked it and at which date. The usage-note card adds a "Write a note" button and a form: label, a 17px textarea with a 4px radius, a preview button and a Band result box, plus a line saying the demo does not save notes.

**Open now card.** A program that opened after the bill's date and is open today sits with the actions. It has a Band status chip, "Open now, since <date>", with a calendar-check icon, the smaller amount size, and a footer saying the checker judged it at the bill's date, before it opened, so the card claims no eligibility.

**Taken card.** An action the household said it already took: transparent, 16px by 24px padding, a 20px title, a status chip with a notebook icon, and the household's quote.

### Memory switch
On the second bill, beside "Here is why.". A `role="switch"` button at least 44px tall: a 56 by 32px pill track with a 1px Line Strong border (Surface when off, Service Blue when on), a 24px knob (Ink Muted, then On Service) that slides 24px, the label "Use what you told us" in Public Sans 600 18px and an On/Off word. Hover turns the track border Service Blue; press shrinks the knob to 0.94. One 16px line under it says what turning it off changes. In the cause column, a note panel lists the dated notes, says where they are kept, and gives a reading line (check-circle in Service Blue when on, warning in Ink Muted when off), followed by the "Same bill, with and without your notes" table, whose live column header carries the inset Service Blue underline and whose changed rows are Band with an arrows icon.

### Not-offered list
"Looked at and not offered (N)", a two-column ruled list (one column on phones). Each row: a 22px Ink Muted icon, the program name in Public Sans 18px, the reason at 16px, and a small line naming who checked it and at which date, plus today's date when that changes the answer.

### Evidence area
"Where the numbers come from", a ruled list of native `details`. Each summary is at least 48px tall: a Service Blue icon, a 19px 600 Public Sans title (Link Blue on hover) and a caret that rotates 180deg. Bodies are indented 38px (none on phones), 17px Ink Muted, up to 60ch, with SQL in a `pre` block (Atkinson Mono 16px on Ink at 4.5%, 1px border, 4px radius, wrapped) and inline identifiers in mono. The last block is a table, "On this page / In the code / What it does".

**Agent names.** On screen agents are Bill reader, Price check, Weather check, Usage math, The checker, Your notes and Help finder. The CamelCase code names (BillReader, RateAnalyst, WeatherAnalyst, UsageAnalyst, ReconciliationCritic, HouseholdMemory, ActionPlanner) appear only in the evidence area, in the agents table's code column. Every other place goes through the plain-name lookup. That lookup falls back to the code name for an agent it does not know, so a new agent would show its code name until it is added to the list.

### Loading and failure
While loading, skeleton lines and boxes on Band pulse in opacity (pale at 16% on the shell), with an hourglass icon and a plain sentence; no default values are drawn. A failure is a box with a 25px title, a warning icon (in Reject Ink, see the drift note under Colors), a plain message and a solid "Try again" button.

### Motion
One easing, `cubic-bezier(0.23, 1, 0.32, 1)`. Blocks rise in (opacity plus a 6px lift, 260ms) at 60ms steps by block index; table rows rise in at 240ms, from 200ms plus 30ms per row, index capped at 7. Running-total segments grow with `scaleX` (260ms, from 260ms plus 70ms per row); bill markers rise at 200ms. Weather bars grow with `scaleY` from the bottom (240ms, from 240ms plus 4ms per day). Hover and color transitions run 160ms, press transforms 120ms (buttons scale to 0.97, the thumbnail to 0.98), the switch and the evidence caret 180ms, the chart shading and brackets 200ms. Skeletons pulse over 1.2s. When the page re-renders the same bill (turning the memory switch), entrance animations are skipped. Under `prefers-reduced-motion: reduce` every animation and transition is turned off, and the script scrolls to the weather strip without smooth scrolling.

## Do's and Don'ts

### Do:
- **Do** set every figure in Public Sans with tabular, lining numbers, and keep digits inside sentences on the WSH Figures face.
- **Do** keep running text at 16px or larger (18px body, 17px on phones) and chart labels at 14px.
- **Do** color added money Heat or Heat Ink and money taken off Cold or Cold Ink, and pair every amount with a sign, a unit and a verb.
- **Do** use the six temperature steps only for weather bars and their legend.
- **Do** keep rejection red for the checker's rejection.
- **Do** use one 4px radius for boxes, buttons, chips and fields, 2px for small marks and 1px for bars.
- **Do** hold a whole thing in a bordered box and set lists as ruled lines.
- **Do** use Phosphor Light icons, with the meaning carried by the text beside them.
- **Do** name agents by their plain names and keep code names in the evidence area.
- **Do** keep touch targets at 44 to 48px and the 3px Heat Ink focus ring.

### Don't:
- **Don't** add shadows; `--shadow` is `none`.
- **Don't** color the change figure itself; only its arrow takes Heat Ink or Cold Ink.
- **Don't** use Atkinson Hyperlegible Mono outside SQL and identifiers.
- **Don't** reuse the Heat tint of the sample-data label or the Reject Ink icon of the failure card; both are drift, not rules.
- **Don't** show a CamelCase agent name outside the evidence area.
- **Don't** use emojis anywhere.
