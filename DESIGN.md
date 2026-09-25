---
name: poke-pack.rip
description: A card print proof at the press table for opening virtual Pokémon TCG boosters.
colors:
  press-table: "#101b30"
  press-blue: "#2755c5"
  press-blue-deep: "#1d3985"
  press-panel: "#192b4b"
  press-panel-hover: "#20365c"
  cool-paper: "#e9edf2"
  proof-ink: "#14223d"
  light-ink: "#f7f7f0"
  muted-ink: "#b9c6da"
  action-coral: "#ff7860"
  action-coral-hover: "#ff9a80"
  coin-gold: "#ffd45c"
  coin-gold-light: "#ffe38f"
  proof-line: "rgba(226, 237, 255, .18)"
typography:
  display:
    fontFamily: '"Archivo Black", "Sora", sans-serif'
    fontSize: "clamp(52px, 6vw, 94px)"
    lineHeight: 0.95
    letterSpacing: "-.035em"
  headline:
    fontFamily: '"Archivo Black", "Sora", sans-serif'
    fontSize: "clamp(25px, 2.5vw, 36px)"
    letterSpacing: "-.02em"
  title:
    fontFamily: '"Archivo Black", "Sora", sans-serif'
    fontSize: "22px"
    letterSpacing: "-.02em"
  body:
    fontFamily: '"Sora", system-ui, sans-serif'
    fontSize: "16px"
    lineHeight: 1.7
  label:
    fontFamily: '"Sora", system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 700
rounded:
  tab: "3px"
  small: "5px"
  surface: "6px"
  field: "12px"
spacing:
  tight: "7px"
  compact: "12px"
  card: "20px"
  section: "54px"
components:
  button-primary:
    backgroundColor: "{colors.action-coral}"
    textColor: "{colors.proof-ink}"
    rounded: "{rounded.surface}"
    padding: "14px 18px"
  button-primary-hover:
    backgroundColor: "{colors.action-coral-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.surface}"
    padding: "14px 18px"
  set-tab:
    backgroundColor: "{colors.press-panel-hover}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.tab}"
    padding: "9px 11px"
  set-tab-active:
    backgroundColor: "{colors.cool-paper}"
    textColor: "{colors.proof-ink}"
    rounded: "{rounded.tab}"
    padding: "9px 11px"
  pack-card:
    backgroundColor: "{colors.cool-paper}"
    textColor: "{colors.proof-ink}"
    rounded: "{rounded.surface}"
    padding: "20px"
---

# Design System: poke-pack.rip

## Overview

**Creative North Star: "The Card Print Proof"**

The interface treats a pack opening like a proof laid out at a press table. Deep blue surrounds real wrapper and card art; a saturated blue stage frames the featured pack, while cool paper panels make sets and collection data easy to read. Coral marks the opening action. Small registration corners, fine trim rules, and compact tabs provide the print-shop character.

The pace is direct: the wrapper, set choice, and opening action appear together. The same materials continue through pack selection, collection tools, and the reveal overlay. The product keeps its fan-made mark, real card scans, and existing foil effects.

**Key Characteristics:**
- Saturated blue stage around real pack and card imagery.
- Paper panels against a dark press-table field.
- Compact, label-like controls and fine print-rule details.
- Card art remains the focal point during opening and reveal.

## Colors

The palette uses cool blues for structure, light paper for information, and two distinct warm accents for action and coin state.

### Primary
- **Press Blue** (`press-blue`): the featured pack stage and progress fill.
- **Press Table** (`press-table`): the page field behind all sections.

### Secondary
- **Action Coral** (`action-coral`): primary opening and buying controls; `action-coral-hover` is the hover state.

### Tertiary
- **Coin Gold** (`coin-gold`): coin, claim, selection, and focus cues; `coin-gold-light` supplies lighter text on dark fields. It does not replace coral as the opening action.

### Neutral
- **Cool Paper** (`cool-paper`): pack and set cards, selected tabs, and collection headers.
- **Proof Ink** (`proof-ink`): dark copy on paper.
- **Light Ink** (`light-ink`) and **Muted Ink** (`muted-ink`): primary and supporting copy on blue.
- **Press Panel** (`press-panel`), **Press Panel Hover** (`press-panel-hover`), and **Proof Line** (`proof-line`): secondary surfaces and separators.

### Named Rules
**The Action Color Rule.** Use coral for the primary opening path and gold for coin or reward information.

## Typography

**Display Font:** Archivo Black with Sora fallback.
**Body Font:** Sora with system sans-serif fallback.

**Character:** Dense, emphatic display lettering sits beside measured body copy and small physical-label text. The card artwork supplies detail, so interface text stays concise.

### Hierarchy
- **Display:** the home promise uses the `display` token, a tight two-line silhouette limited to about 10 characters in width.
- **Headline:** home section headings use the `headline` token.
- **Title:** section headings use the `title` token; pack names also use Archivo Black.
- **Body:** the home introduction uses the `body` token and a 50-character maximum line length. Dense pack and shop supporting copy is smaller.
- **Label:** navigation, set tabs, tags, and proof metadata use Sora at compact sizes with strong weight. Some proof metadata is uppercase with tracked lettering.

### Named Rules
**The Artwork Leads Rule.** Large display type introduces the action; the wrapper and card scan carry the visual detail.

## Layout

The main content container is capped at 1360px with 48px total outer gutter on larger screens. The home hero is a two-column arrangement, with copy at roughly 46% and a blue pack stage at roughly 54%, separated by a responsive 24–64px gap. The stage is at least 525px tall on desktop. Sections use generous vertical separation, while tabs and cards pack information more tightly.

At 860px the hero compresses and the stage shortens. At 720px it becomes a vertical sequence: promise, introduction, pack stage, primary action, set selector, then progress. The outer gutter becomes 28px; the pack stage remains at least 355px tall and the opening button becomes full width. The shop grid drops to two columns at 720px and one column under 350px. The header moves navigation to a second row at 720px.

## Elevation & Depth

The world is mostly flat. Paper and dark-panel contrast, thin rules, and the blue stage establish layers. The hero stage has a structural shadow (`0 28px 50px rgba(3, 12, 35, .38)`), reduced on mobile (`0 18px 34px rgba(3, 12, 35, .38)`). Real wrapper and card images carry drop shadows within that stage. Ordinary pack and set cards have no resting shadow; hover adds a small upward motion and surface shift. The shared `--shadow` token supports the navigation dropdown.

**The Proof Surface Rule.** Keep ordinary information panels flat; reserve stronger depth for the featured physical objects and overlay layers.

## Shapes

Proof panels and main controls have small corners (`rounded.surface`); set tabs are nearly square (`rounded.tab`). Navigation items use `rounded.small`. A few inherited fields and minor controls retain larger radii, so radius varies by component rather than forming a universal scale. Borders are thin, cool blue lines. The stage uses square edges and registration-corner marks around the pack art.

## Components

### Buttons
- **Primary:** coral fill, dark text, compact corner, and the `button-primary` padding; hover lightens to `action-coral-hover`.
- **Ghost:** transparent fill and a blue-gray border; hover takes on the darker blue panel fill.
- **Focus:** keyboard focus is a 3px gold outline with a 3px offset across interactive elements.

### Set Tabs
- **Default:** blue panel, muted text, fine border, and nearly square corners.
- **Active:** cool paper and dark ink. Mobile rows scroll horizontally rather than squeezing labels.

### Cards / Containers
- **Pack and set cards:** cool paper, dark ink, 6px corners, no resting shadow; hover lightens the paper and lifts 3px.
- **Secondary panels:** dark blue fill and fine blue border, also with 6px corners.
- **Featured stage:** press-blue field with trim rules, registration corners, real wrapper and card imagery, and a clearly printed set name and odds.

### Inputs / Fields
- **Collection search:** dark translucent fill, a fine line, 12px corners, and 10px by 12px padding. Focus uses the gold outline.

### Navigation
- **Header:** compact, sticky, dark blue surface with a paper bottom rule. Links are small Sora labels. Hover deepens blue; the active item switches to paper with dark text. The extra destinations open in a bordered blue dropdown.

## Do's and Don'ts

### Do:
- **Do** keep real wrapper and card artwork prominent inside the press-blue opening stage.
- **Do** use paper surfaces for dense set and collection information.
- **Do** carry small trim lines and registration marks where they clarify the proof-sheet structure.
- **Do** retain the gold keyboard focus outline and reduced-motion behavior.

### Don't:
- **Don't** turn every card into a floating, glowing tile; flat paper and blue panels are the repeated treatment.
- **Don't** use gold as the primary pack-opening action color; coral marks that path.
- **Don't** let decorative press marks compete with card art or printed odds.
