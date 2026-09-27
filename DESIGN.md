---
name: hermad
description: Engineering-drawing documentation for a multi-agent orchestration CLI.
colors:
  vellum: "#eef2f5"
  sheet: "#f7f9fb"
  drafting-ink: "#1b2a44"
  ink-soft: "#3d4d68"
  graphite: "#5f6e84"
  pencil-rule: "#b9c4d2"
  pencil-rule-strong: "#8796ab"
  redline: "#b8321f"
  redline-wash: "#f6e3df"
  approval: "#0d6e62"
  approval-wash: "#dcefeb"
  code-ground: "#e3e9f0"
  vellum-dark: "#0b2139"
  sheet-dark: "#0f2a47"
  drafting-ink-dark: "#e4edf7"
  ink-soft-dark: "#bfd0e3"
  graphite-dark: "#93a9c3"
  pencil-rule-dark: "#294a6e"
  pencil-rule-strong-dark: "#4a6d94"
  redline-dark: "#ff8a78"
  redline-wash-dark: "#3a2530"
  approval-dark: "#62d6c2"
  approval-wash-dark: "#123f45"
  code-ground-dark: "#0a2036"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "clamp(30px, 4.6vw, 52px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "clamp(22px, 2.6vw, 30px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.01em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.01em"
  body:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.1em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  none: "0px"
  code: "3px"
  command: "4px"
  node: "50%"
spacing:
  cell: "8px 10px 10px"
  table-cell: "7px 10px"
  column: "14px 16px 16px"
  record-gap: "18px"
  heading-gap: "20px"
  sheet-pad: "clamp(20px, 3.5vw, 44px)"
  section-gap: "clamp(44px, 6vw, 76px)"
components:
  sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.drafting-ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.sheet-pad}"
    width: "1180px"
  title-block-cell:
    textColor: "{colors.drafting-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "{spacing.cell}"
  ecn-record:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.drafting-ink}"
    rounded: "{rounded.none}"
  ecn-was-label:
    textColor: "{colors.redline}"
    typography: "{typography.label}"
    padding: "{spacing.column}"
  ecn-is-label:
    textColor: "{colors.approval}"
    typography: "{typography.label}"
    padding: "{spacing.column}"
  table-header:
    textColor: "{colors.graphite}"
    typography: "{typography.label}"
    padding: "{spacing.table-cell}"
  command-block:
    backgroundColor: "{colors.code-ground}"
    textColor: "{colors.drafting-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.command}"
    padding: "12px 80px 12px 14px"
  copy-button:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.drafting-ink}"
    rounded: "{rounded.code}"
    padding: "6px 9px"
  copy-button-hover:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.approval}"
  route-node:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.approval}"
    rounded: "{rounded.node}"
    size: "13px"
  route-gate:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.redline}"
    rounded: "2px"
    size: "13px"
---

# Design System: hermad

## Overview

**Creative North Star: "The Drafting Office"**

hermad's documentation is issued like an engineering drawing, not published like a blog. Every page is a single bordered sheet laid on a vellum ground, with a title block for its metadata (drawing number, revision, date, sheet count, reviewed and approved), margin zone letters and tick marks, and change records that read as Engineering Change Notices: a numbered line, a WAS column in redline, an IS column in approval green-cyan, and a dashed "affected" strip listing the real files touched.

The density is that of a technical document for people who already know the tools: tables, hairlines, and short labelled fields, never cards or feature grids. Color carries meaning, not decoration. Redline marks what was replaced, what is at risk, or where a human must stop; approval marks what is current, verified, or on the working route. Everything else is drafting ink and pencil graphite on paper.

The dark theme is not an inverted page but a blueprint: deep navy paper, pale ink, a lighter redline and a brighter cyan. Both themes are first-class and follow `prefers-color-scheme`, with a `data-theme` override on the root.

**Key Characteristics:**
- One bordered sheet per page, with a double frame (1.5px ink border plus a 1px pencil outline offset 6px), margin zone letters and tick marks.
- A title block grid for document metadata instead of a hero.
- Change records as WAS / IS pairs with an affected-files strip.
- A single continuous route line in the sheet's left gutter; human gates break it with dashes and a redline diamond.
- Condensed technical sans for every label and heading, a humanist sans for reading, mono for anything a user types.
- Square corners on every structural element; radius only on code and the copy control.

## Colors

A cool vellum-and-ink palette with exactly two signal colors, redline and approval, each paired with a pale wash.

### Primary
- **Approval Green-Cyan** (approval / approval-dark): the IS column label and its 3px top rule, the route line and its nodes, links, focus rings, the "verified" status dot, the "Verificar" tag, the revision delta mark, and the copy button's hover and done states.

### Secondary
- **Redline** (redline / redline-dark): the WAS column label and its 3px top rule, human-gate nodes on the route, warning status dots, and "Riesgo" / "Límite" tags. It is the drafting convention for what was struck out or needs attention.

### Neutral
- **Vellum** (vellum / vellum-dark): the page ground around the sheet.
- **Sheet** (sheet / sheet-dark): the drawing surface itself; also the fill of hollow route nodes and the copy button.
- **Drafting Ink** (drafting-ink / drafting-ink-dark): body text, headings, and the heavy 1.5px structural lines (sheet border, title block border, section rules, table header rules, footer rule).
- **Ink Soft** (ink-soft / ink-soft-dark): secondary reading text such as ledes, route descriptions and recipe descriptions.
- **Pencil Graphite** (graphite / graphite-dark): labels, field keys, table headers, reference notes, zone letters, code comments.
- **Pencil Rule** (pencil-rule / pencil-rule-dark): light hairlines between table rows and list items; the command block border.
- **Pencil Rule Strong** (pencil-rule-strong / pencil-rule-strong-dark): title block cell dividers, ECN record borders, WAS/IS dividers, tick marks, the outer sheet outline.
- **Redline Wash / Approval Wash** (redline-wash, approval-wash and their dark variants): pale grounds for the signal colors; the approval wash is the text selection color.
- **Code Ground** (code-ground / code-ground-dark): inline code and command block backgrounds.

### Named Rules
**The Two Signals Rule.** Redline and approval are the only hues. Redline means replaced, at risk, or human gate; approval means current, verified, or on route. Never use either for decoration.

**The Blueprint Rule.** The dark theme swaps the full token set at once (dark-suffixed keys above), never a partial override. Signal colors lighten to stay legible on navy.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow, Roboto Condensed)
**Body Font:** Atkinson Hyperlegible (with Segoe UI, system-ui)
**Label/Mono Font:** Barlow Condensed for labels; JetBrains Mono (with ui-monospace, SF Mono, Menlo, Consolas) for commands, file paths, ECN ids and title block values

**Loading (open item):** all three families load from Google Fonts (`fonts.googleapis.com`, `display=swap`), not self-hosted. Whether to self-host is undecided; the fallback stacks above are the contract either way.

**Character:** A condensed drafting-lettering sans does all the structural talking, a high-legibility humanist sans does the reading, and a mono marks anything literal. The pairing reads as annotation on a drawing.

### Hierarchy
- **Display** (700, clamp(30px, 4.6vw, 52px), 1.02): the document title inside the title block's full-width cell.
- **Headline** (700, clamp(22px, 2.6vw, 30px), 1.1): section headings, sitting on a 1.5px ink rule.
- **Title** (700, 17-19px, 1.2-1.3): ECN record titles (19px), recipe headings (18px), route station names (17px).
- **Body** (400, 16px, 1.6): all prose; ledes cap at 60ch, route and recipe text at 62ch, notes at 70ch.
- **Label** (600-700, 11-13px, 0.08-0.14em tracking, uppercase): title block keys, table headers, captions (13px, 0.12em), WAS/IS markers (12px, 0.14em), tags (12px, 0.12em), copy button (12px, 0.08em). Unuppercased 14px label weight 500 at 0.04em is used for references and decision ids.
- **Mono** (400-600, 12.5-15px): inline code at 0.86em, command blocks 13px/1.55, ECN ids 13px/600, title block values 13.5px, affected-file paths 12.5px.

### Named Rules
**The Lettering Rule.** Every heading, label, field key and control is set in the condensed face; body prose never is.

**The Literal Rule.** Anything a reader could type or grep (commands, paths, identifiers, markers, drawing numbers) is set in mono.

## Layout

A single centered sheet, max 1180px, on the vellum ground, with 16px side padding on the body and 28px/64px block padding. Inner padding scales `clamp(20px, 3.5vw, 44px)`; sections are separated by `clamp(44px, 6vw, 76px)`. Each section opens with a heading row (heading plus an optional right-hand reference note) over a 1.5px ink rule, 8px below the text and 20px above content.

The header is a two-column grid (1.15fr / 1fr): title block left, change index table right. Change records stack with 18px between them. Recipes and notes use auto-fit grids (min 460px and 320px). Tables use tabular numerals and scroll horizontally inside a wrapper rather than squeezing.

Responsive steps: at 900px the header collapses to one column; at 720px the zone letters, ticks and outer outline disappear, ECN heads stack, and WAS/IS become stacked rows; at 520px the title block drops from four columns to two.

## Elevation & Depth

Flat. Depth is drawn, not lit: a 1.5px ink border plus a 1px pencil outline offset 6px frames the sheet, and hierarchy comes from line weight (1.5px ink for structure, 1px pencil for divisions, dashed for secondary strips). The only shadows are inset 3px top rules on WAS/IS columns (a drawn line, not a lift) and a targeted state.

### Shadow Vocabulary
- **Column Rule** (`box-shadow: inset 0 3px 0 var(--redline)` / `var(--approve)`): the colored top edge of WAS and IS columns.
- **Target Halo** (`box-shadow: 0 0 0 2px var(--approve), 0 10px 28px -12px rgba(13, 110, 98, 0.45)`): an ECN record reached by anchor link, eased in over 0.6s `cubic-bezier(0.16, 1, 0.3, 1)`.

### Named Rules
**The Line Weight Rule.** Hierarchy is expressed by stroke weight and style (1.5px ink, 1px pencil, dashed), never by drop shadows or tinted cards.

## Shapes

Square corners on every structural element: sheet, title block, ECN records, tables, section rules. Radius appears only on small literal elements (inline code and copy button at 3px, command blocks at 4px) and on route geometry: circular 13px nodes (hollow with a 3px approval ring, filled at the terminus) and a 45-degree-rotated square for human gates. The revision delta is a stroked triangle with the rev letter inside, drawn as inline SVG.

## Components

### Sheet
The page itself. Sheet fill, 1.5px drafting-ink border, 1px pencil-rule-strong outline offset 6px. Zone numbers 1-6 run along the top and bottom and letters A-D down the sides at 21px outside the border (11px label, graphite), with 7px tick marks at sixths and quarters. The frame furniture is hidden below 720px.

### Title Block
A four-column grid inside a 1.5px ink border, cells divided by 1px pencil-rule-strong lines, padded 8px 10px 10px. Each cell has an uppercase graphite key (label) above a value (15px condensed 600, or mono 13.5px for identifiers). Full-width and two-column spans hold the title and longer values. Status values carry an 8px dot: approval for passed, redline for pending.

### ECN Record
A 1px pencil-rule-strong box. The head row is a three-part grid: mono id in a 7.5rem cell, condensed title, graphite decision reference right. Below, WAS and IS sit side by side, divided by a 1px rule, padded 14px 16px 16px, each with its signal-colored label and 3px top rule; the IS label is preceded by the revision delta mark. A dashed top border separates the affected strip: an "Afecta" key followed by wrapping mono file paths. Anchor targets receive the Target Halo.

### Route Line
One continuous 3px approval line in the sheet's left gutter, starting at the title block (with a 13px filled origin dot) and ending at the last route station; its extent is measured by script so it survives reflow and font load. Stations are hollow 13px nodes; the terminus is filled. A human gate is a redline diamond with its station name in redline, and the line above it is broken into 5px dashes.

### Command Block
Code-ground fill, 1px pencil-rule border, 4px radius, mono 13px/1.55 with graphite comments. A copy button sits top-right: sheet fill, 1px pencil-rule-strong border, 3px radius, 12px uppercase label; hover and done shift border and text to approval. Copied text strips trailing comments; on clipboard failure the block text is selected instead.

### Tables
Full-width, collapsed borders, 1px pencil-rule row lines, 7px 10px cells. Headers are uppercase graphite labels over a 1.5px ink rule; captions are 13px uppercase ink labels, left-aligned. Index tables set ids in mono and links in ink, turning approval on hover.

### Tags and Open Items
List rows on a 5.5rem / 1fr grid with pencil-rule dividers. The tag is a 12px uppercase label in approval ("Verificar") or redline ("Riesgo", "Límite").

## Do's and Don'ts

### Do:
- **Do** put document metadata (drawing number, revision, date, sheet, base commit, verification, status, reviewed, approved) in a title block, with mono values for identifiers.
- **Do** express each change as a numbered ECN with WAS in redline, IS in approval, and an affected strip that lists only real files.
- **Do** keep hierarchy in line weight: 1.5px drafting ink for structure, 1px pencil for divisions, dashed for secondary strips.
- **Do** ship both themes by swapping the whole token set, honoring `prefers-color-scheme` and a root `data-theme` override.
- **Do** respect `prefers-reduced-motion` by dropping transitions and smooth scroll.

### Don't:
- **Don't** use redline or approval as decoration; each means a state.
- **Don't** round structural containers; radius is reserved for code, the copy control and route geometry.
- **Don't** replace the title block with a hero or the ECN record with a bullet changelog or feature card grid.
- **Don't** set body prose in the condensed face or commands and paths in anything but mono.
