---
name: HRPaySync
description: A clean operations console for contract manpower and attendance, white ground and one premium blue.
colors:
  primary: "oklch(0.52 0.2 262)"
  primary-foreground: "oklch(0.99 0 0)"
  accent: "oklch(0.96 0.025 260)"
  accent-foreground: "oklch(0.42 0.17 262)"
  background: "oklch(1 0 0)"
  foreground: "oklch(0.21 0.02 265)"
  secondary: "oklch(0.97 0.006 265)"
  secondary-foreground: "oklch(0.28 0.03 265)"
  muted: "oklch(0.975 0.004 265)"
  muted-foreground: "oklch(0.52 0.02 265)"
  border: "oklch(0.925 0.006 265)"
  input: "oklch(0.89 0.008 265)"
  sidebar: "oklch(0.985 0.003 265)"
  sidebar-accent: "oklch(0.955 0.025 260)"
  destructive: "oklch(0.57 0.21 27)"
  success: "oklch(0.56 0.13 155)"
  warning: "oklch(0.7 0.15 70)"
  shift-day: "oklch(0.93 0.045 255)"
  shift-day-foreground: "oklch(0.36 0.13 263)"
  shift-night: "oklch(0.42 0.16 264)"
  shift-night-foreground: "oklch(0.99 0 0)"
  shift-general: "oklch(0.97 0.02 250)"
  shift-general-foreground: "oklch(0.42 0.14 262)"
  chart-1: "oklch(0.52 0.2 262)"
  chart-2: "oklch(0.7 0.13 255)"
  chart-3: "oklch(0.83 0.07 252)"
  chart-4: "oklch(0.36 0.13 265)"
  chart-5: "oklch(0.75 0.02 265)"
typography:
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  title-small:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.375
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"cv11\", \"ss01\", \"tnum\""
  body-small:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.3
  caption:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "\"tnum\""
  mono-chip:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
  button-destructive:
    backgroundColor: "color-mix(in oklch, oklch(0.57 0.21 27) 10%, transparent)"
    textColor: "{colors.destructive}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-link:
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    padding: "0"
  field:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
    height: "36px"
  tag-ok:
    backgroundColor: "color-mix(in oklch, oklch(0.56 0.13 155) 12%, transparent)"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    height: "20px"
  tag-alert:
    backgroundColor: "color-mix(in oklch, oklch(0.57 0.21 27) 10%, transparent)"
    textColor: "{colors.destructive}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    height: "20px"
  tag-day:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    height: "20px"
  tag-night:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    height: "20px"
  tag-muted:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    height: "20px"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "16px"
  shift-chip-day:
    backgroundColor: "{colors.shift-day}"
    textColor: "{colors.shift-day-foreground}"
    typography: "{typography.mono-chip}"
    rounded: "{rounded.md}"
  shift-chip-night:
    backgroundColor: "{colors.shift-night}"
    textColor: "{colors.shift-night-foreground}"
    typography: "{typography.mono-chip}"
    rounded: "{rounded.md}"
  shift-chip-general:
    backgroundColor: "{colors.shift-general}"
    textColor: "{colors.shift-general-foreground}"
    typography: "{typography.mono-chip}"
    rounded: "{rounded.md}"
  sidebar:
    backgroundColor: "{colors.sidebar}"
    width: "256px"
  sidebar-item-active:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.md}"
    padding: "8px"
  segmented-track:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.lg}"
    padding: "3px"
  segmented-thumb:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "30px"
---

# Design System: HRPaySync

## Overview

**Creative North Star: "The Quiet Control Room"**

A calm, white operations console where one blue does all the talking. Surfaces are white, structure comes from hairline cool-grey borders and the lightest of shadows, and the single premium blue marks what is primary: the main action, the active nav item, the current tab, the filled part of a progress bar, the newest event on a timeline. Everything else stays neutral, so exceptions in red stand out against a screen that is otherwise quiet.

Density is that of a working admin tool: 14px body text, tabular numerals everywhere, tables with sticky muted heads, cards on a 16px inner rhythm. Hierarchy comes from weight and size inside one family (Geist), not from colour: a 24px semibold page title over a 14px muted description, a 24px count beside its muted denominator. Geist Mono is kept for IDs, punch times and codes.

Motion is brief and eased out: 120-300ms on a quart ease-out curve, with cards settling 4px into place on first paint. Content is never hidden waiting for an animation, and reduced-motion users get none.

**Key Characteristics:**
- White ground, cool neutral greys (hue 265), one premium blue.
- Semantic red, green and amber appear only as small status signals.
- Day, night and general shifts are three steps of the same blue; charts are single-hue blue.
- Geist for everything, Geist Mono for IDs and times; sentence case throughout.
- Rounded-lg controls (10px), rounded-xl cards (14px), xs/sm shadows only.
- shadcn/ui (radix-nova) primitives, with Tabs, SegmentedControl, Timeline and StatCard from 21st.dev.

## Colors

A white and cool-grey field with one saturated blue; the semantic hues are reserved for status.

### Primary
- **Premium Blue** (primary): Primary buttons, links, focus rings and input carets, the active tab underline, progress fill, the brand tile, the newest timeline marker, filled status marks, and the night-shift tag. It is the only brand colour.
- **Pale Blue Wash** (accent, with accent-foreground as its text): Text selection, the active sidebar item, icon chips on stat cards, the "Demo data" badge, day-shift tags, the contractor-scope banner, the selected needs-action row, and the scheduled span of a shift bar.

### Neutral
- **White** (background, card, popover): Page ground, cards, panels, inputs, sheets.
- **Ink** (foreground): Primary text; a deep blue-tinted near-black.
- **Mist** (secondary, muted): Table heads, segmented-control tracks, muted tags, disabled fields, row hover, progress troughs.
- **Slate** (muted-foreground): Secondary text, descriptions, hints, captions, timestamps.
- **Hairline** (border) and **Input Edge** (input): Card and table rules / field and hollow-marker borders.
- **Sidebar Mist** (sidebar): The sidebar ground, one step off white.

### Status (semantic only)
- **Signal Red** (destructive): Errors, invalid fields, destructive buttons, alert tags, extension overflow on the shift bar, disputed marks, needs-action dots, blocking compliance checks.
- **Signal Green** (success): "At strength" progress, ok tags, passed compliance checks, the all-clear empty state.
- **Signal Amber** (warning): Non-blocking warnings only (warning-severity queue dots, warn-level compliance checks).

### Attendance day statuses (semantic only)
One vocabulary for a worker's day, defined once in `src/components/status.tsx` (`statusOf` in `src/lib/attendance.ts`) and used by the attendance register, the shift board and their legends, so a status always has the same icon, colour and words. Each has a text colour, a soft tint (12–15%) and a solid fill (`--status-*` tokens).
- **Present** green, check · **Late** amber, clock · **Missing OUT** orange, exit arrow · **Absent** red, cross · **On duty now** the primary blue, dot · **Not started** muted grey, dashed circle · **Week off / rest** slate, moon · **Holiday** purple, flag.
- Late wins over present and on duty, because it needs attention. Colour never stands alone: every status also has its icon or mark and its label in text or the accessible name.

### Shift and chart steps
- **Shift Day / Night / General**: a pale blue chip with dark blue text, a deep blue chip with white text, and a near-white blue chip with a faint primary edge. Used on board ID chips, roster cells and report shift cells.
- **Chart 1-5**: primary blue, mid blue, pale blue, deep navy, and a cool grey for "other". Present is chart-1; approved strength is chart-4 (dashed line) or chart-3 (bar).

### Named Rules
**The One Blue Rule.** Premium blue is the only brand hue. Any new emphasis is a step of that blue or a neutral; no second accent colour.

**The Status Only Rule.** Red, green and amber mean error, ok and warning. They never decorate, never categorise, and never stand in for a shift.

**The Same Hue Shifts Rule.** Day, night and general shifts are distinguished by lightness steps of the blue plus their letter or label, never by separate hues.

## Typography

**Display Font:** Geist (with ui-sans-serif, system-ui)
**Body Font:** Geist (with ui-sans-serif, system-ui)
**Label/Mono Font:** Geist Mono (with ui-monospace), for worker IDs, device refs, punch times and codes

**Character:** One neutral grotesque at a few sizes and two weights (500, 600). Body text runs with the cv11 and ss01 alternates and tabular numerals on, so columns of counts line up.

### Hierarchy
- **Headline** (600, 24px, tight tracking): Page titles in the page header, stat-card values, board slot counts.
- **Title** (600, 18px): Side-sheet titles and dialog titles.
- **Title Small** (500-600, 16px or 14px semibold): Card titles, panel headings, contractor group and department names.
- **Body** (400, 14px, line-height 1.5): Running text, table cells, page descriptions capped at 72ch.
- **Body Small / Label** (13px; 500 for labels): Field labels, table column heads, hints, banners, read-only notes, segmented options.
- **Caption** (12px): Timestamps, sidebar sub-lines, shift-bar durations, legend notes.
- **Mono** (12-13px): IDs and times in tables and sheets. Board ID chips step down to 11px (500) to fit a 36px chip.

### Named Rules
**The Sentence Case Rule.** Headings, labels, buttons and tags are sentence case. No uppercase labels, no letter-spaced small caps.

**The Mono Is For Codes Rule.** Geist Mono is only for IDs, device refs, codes and clock times. Names, counts and prose stay in Geist.

## Layout

A shadcn sidebar layout: a 256px sidebar on the left that collapses to a 48px icon rail, and becomes an off-canvas sheet (288px) on mobile. The work area has a sticky 56px header (translucent white with a backdrop blur) holding the sidebar trigger, work date, data-as-of time, refresh, quick find and the "Demo data" badge; banners for storage loss and contractor scope sit directly under it. The main column is capped at 1600px and padded 16 / 24 / 32px by breakpoint (24px / 32px vertical).

Rhythm runs on a 4px base: 6px between board chips and inside fields, 12px between card parts, 16px card padding and board gaps, 24px between page sections and inside sheets, 32px between board contractor groups. The board measures its columns from the container width at a 184px minimum slot plus a 16px gap; from `xl` (1280px) a 340px needs-action queue sits sticky on the right, and below that it moves above the board and shows one item at a time.

Data tables use rules, not boxes: a sticky 40px muted head with 13px medium muted labels, 10x12px cells, a 1px hairline under each row, and a soft muted row hover. Numbers are right-aligned and tabular.

## Elevation & Depth

Mostly flat with hairline borders; shadows are slate-tinted and ambient, never structural. Cards and panels carry the faintest shadow; hover lifts a link card one step; only overlays (sheets, dropdowns, toasts, the skip link) use the larger shadows. Modal backdrops tint the page with 35% ink and a 2px blur.

### Shadow Vocabulary
- **Hairline** (`box-shadow: 0 1px 2px 0 rgb(15 23 42 / 0.04)`): Cards, panels, fields at rest.
- **Small** (`box-shadow: 0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.04)`): Stat-card hover, the selected segmented thumb, the brand tile.
- **Medium** (`box-shadow: 0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.04)`): Menus and the focused skip link.
- **Large** (`box-shadow: 0 16px 40px -12px rgb(15 23 42 / 0.18)`): Sheets and dialogs.

### Named Rules
**The Border First Rule.** Separation comes from a 1px hairline border; a shadow is only added on top, at xs at rest and sm on hover.

## Shapes

Soft, consistent corners from one 10px base radius: 6px for small chips and code pills, 8px for fields, segmented thumbs, board ID chips and sidebar items, 10px for buttons, segmented tracks, read-only notes and icon chips, 14px for cards, panels, stat cards and empty states. Badges, tags, progress bars, the shift bar and timeline markers are fully round. Borders are 1px; absent board chips use a 1.5px dashed edge and not-started chips a 1.5px dotted edge; empty states use a dashed border.

Status marks are built from geometry in a 12px cell with 3px corners, never from colour alone: filled (present), hollow (absent), dashed (not started), a corner fill (late), a half fill (missing OUT), a tick on fill (verified), a red strike (disputed).

## Components

### Buttons
Calm and compact; one filled blue action per context.
- **Shape:** 10px radius, 36px tall at the default size (32px small), 14px horizontal padding, 13-14px medium text, 16px icons.
- **Primary:** Premium blue fill with white text; hover drops to 80% opacity. In code this is `kind="tape"` on the app Button, a legacy name that maps to the shadcn default variant.
- **Outline (`kind="plain"`):** White fill with a hairline border; hover fills mist.
- **Destructive (`kind="danger"`):** A 10% red wash with red text, deepening to 20% on hover.
- **Link (`kind="quiet"`):** Blue text with no padding, underlined on hover.
- **Ghost / icon:** Used in the header and sheet controls; hover fills mist.
- **States:** Focus shows the blue border plus a 3px ring at 50%; press nudges down 1px; disabled is 50% opacity with no pointer events.

### Chips (Tags)
- **Style:** shadcn Badge, fully round, 20px tall, 12px medium text. Tones: ok (green wash), alert (red wash), day (pale blue), night (solid blue), muted (mist with slate text), ink (outline).
- **Use:** A short status word. Code pills (contractor codes, device IDs) are 6px-radius mist chips in 12px mono.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** White.
- **Shadow Strategy:** Hairline shadow at rest (see Elevation).
- **Border:** 1px hairline (panels use a border, shadcn cards a 10% ink ring).
- **Internal Padding:** 16px (12px for small cards); board slot cards split into a 16px count section and a bordered lanes section.
- **Empty state:** shadcn Empty in a dashed 14px frame with a title and a muted description.
- **Read-only note:** A 10px-radius mist strip with a lock icon, a medium "Read-only." lead and 13px muted text.

### Inputs / Fields
- **Style:** White fill, 1px input-edge border, 8px radius, 36px min height, 6x12px padding, hairline shadow. Native selects draw a grey chevron.
- **Focus:** Border turns blue with a 3px blue ring at 22%; the caret is blue.
- **Error / Disabled:** Invalid fields get a red border and 3px red ring at 18%, with a 13px medium red message linked by aria-describedby. Disabled fields fill mist with slate text.
- **Label:** Always visible above the field, 13px medium; hints in 13px slate.

### Navigation
- **Sidebar:** shadcn Sidebar on sidebar mist, collapsible to icons with tooltips. A blue 32px brand tile and app name at the top; four groups (Overview; Operations; Masters with Workers, Contractors, Shifts, Devices and Holidays; Reports & admin) with 12px group labels; 14px items with 16px lucide icons, 8px padding, 8px radius. Hover and active fill the pale blue wash; active text is dark blue and medium.
- **Role menu:** In the sidebar footer, an avatar (8px radius, blue-tinted initials) with name and role line opens a dropdown of roles and contractor admins, with a blue check on the current one.
- **Mobile:** The sidebar becomes an off-canvas sheet; it closes after a nav tap.

### Stat card (from 21st.dev)
Adapted from 21st.dev's "Stats Card" onto the shadcn Card. The whole card is a link with a visible focus ring. A 13px muted title, a 32px pale-blue icon chip on the right, a 24px semibold tabular value with an optional muted suffix and badge, an optional 6px progress bar, and a 13px muted detail line. Hover raises the shadow to sm and tints the ring blue.

### Tabs, SegmentedControl and Timeline (from 21st.dev)
Installed from 21st.dev into `src/components/21st.tsx`, adapted to the theme tokens with no new dependencies.
- **Tabs:** An underline strip on a hairline bottom border, 14px medium labels 20px apart; the active tab takes a 2px blue underline and ink text, the rest are slate and darken on hover. Roving tabindex with arrow keys; scrolls sideways on narrow screens. Used in Reports.
- **SegmentedControl:** A mist track (10px radius, 3px padding, inset hairline ring) with a white 8px-radius thumb and sm shadow on the selected option; 13px medium labels. A radiogroup with arrow-key focus, disabled as a whole for read-only roles. Used for extra-duty and worker status filters and Warn / Block / Off policy modes.
- **Timeline:** Status history on a 1px hairline rail, oldest first. Each event has a 12px muted timestamp, a medium title, the actor and an optional note. Markers are 10px circles ringed in white: hollow with an input-edge border for earlier events, filled blue for the newest.

### Shift board chip (signature)
A 36px-minimum mono ID chip (11px, 8px radius) in an auto-fill lane. The chip is coloured by its **day status** (above), not by shift: the lane heading carries the shift (Day & general, Night). A corner notch also marks late and a washed right half also marks missing OUT, so status never depends on colour alone. Markers: a "+" badge (extra duty), a red dot (disputed), a dark ring (needs action), a blue outline (selected or matching the search). Status filter pills above the board dim non-matching chips. The legend lists only the statuses on the board, from the same vocabulary.

### Attendance register
Rows are workers (sticky employee code and name), columns are the days of the month (today highlighted, holidays tinted and titled), each cell a day-status icon with small markers for extra duty, disputes and manual punches; monthly totals and a coloured attendance rate sit at the right. One shared floating detail card follows the hovered or keyboard-focused cell; click or Enter opens the shift sheet.

### Shift bar (signature)
A fully round 10px trough with an inset hairline ring. The scheduled shift is the pale blue span, actual time fills in primary blue, any extension overflows past the scheduled end in red, and planned extra duty is a dashed red outline. A 12px caption below gives the shift length and the extension in red.

### Charts
shadcn chart wrappers over Recharts, single-hue blue: present in chart-1, approved strength in chart-4 (dashed) or chart-3, shifts mapped D/N/G to chart-1/4/2, and chart-5 for anything else. Legends use small rounded swatches.

### Sheets and toasts
Side sheets dock right (520px, 720px wide variant) with a bordered header (18px semibold title), a scrolling 24x20px body and a bordered footer of right-aligned actions; focus trap, Esc and overlay come from Radix. Toasts are sonner, bottom-right with a close button, success or error styled.

## Do's and Don'ts

### Do:
- **Do** keep premium blue (oklch(0.52 0.2 262)) as the only accent; reach for accent (pale blue) or neutrals for secondary emphasis.
- **Do** show every status as a shaped mark or a labelled tag; colour is a third signal, never the only one.
- **Do** draw shifts as steps of the blue and charts as single-hue blue series.
- **Do** use 10px radius on controls and 14px on cards, with a hairline border and an xs shadow at rest.
- **Do** ease state changes out on `cubic-bezier(0.25, 1, 0.5, 1)` in 120-300ms, and keep content visible if the animation never runs.
- **Do** build on the shadcn components in `src/components/ui` and the app wrappers in `app-ui.tsx` before adding new primitives.

### Don't:
- **Don't** introduce a second brand hue or multi-hue chart palettes.
- **Don't** use red, green or amber for decoration, categories or shifts.
- **Don't** set labels, buttons or headings in uppercase or letter-spaced caps.
- **Don't** set names, counts or prose in mono.
- **Don't** use heavy, hard-edged or coloured shadows; overlays get the large shadow, surfaces stay at xs to sm.
- **Don't** add a dark theme ad hoc; the system is light only (`color-scheme: light`).
