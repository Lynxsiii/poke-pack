# Per-card vision review (Workflow step 7)

Noah, 2026-11-27: every holo update has every affected card checked individually by an agent "smart enough to tell
what looks good". `scripts/holo_check.py` makes the pictures; this note is the brief for the agents that look at them.

## Who runs it

- Renders and scoring: the script, or a cheap agent running it.
- Judging: a model that can tell good from bad (Opus or Fable). Not Haiku. One agent per 10-20 review sheets
  (120-240 cards); keep to the thread's usage pacing (two or three agents at once at most).

## The brief (paste, fill the brackets)

> You are checking holo renders of Pokémon cards on poke-pack.rip, one card at a time. Each review sheet in [DIR]/review/
> (batch-NNN.jpg, with batch-NNN.json listing the cards in order, left to right, top to bottom) shows 12 cards; each
> card is three images: the plain print, the card at rest, and the card lit by a light at the upper left, at phone
> size. Real photos for some families are in [PHOTO DIRS]. The bar is realism: the foil should look like the real card
> under a lamp, adding light and texture while the art stays readable.
>
> For EVERY card answer one line of JSON: {"id": ..., "verdict": "good" | "bad", "why": "..."}. Call it bad when:
> the art is hazed, greyed or tinted (a wash over the whole art box instead of a highlight); the drawing is buried
> under the texture; a texture looks fake (a uniform diagonal hatch, wavy lines, rings, a line screen, wallpaper that
> ignores the drawing); the foil sits where the real card is matte (a refractor's sky, a window holo's text box) or
> misses where it is foil; dark specks; text made hard to read; a rainbow where the real card has none; the foil
> out of line with the print (doubled lettering, an edge band). Say what you see, in a few words. Do not pass a card
> because its finish is the same as its neighbours': judge each one. Read the images at full size.
>
> Return the list, then a short summary grouped by what is wrong and by family (the `family` field).

## After the review

- Group the bad cards by family and cause; fix the family (mask, recipe, classifier, map), not the card.
- Re-run `holo_check.py` on the family and review the new sheets the same way.
- Put the flagged sheets, before and after, on a private Artifact page for Noah when he asked for the change.
