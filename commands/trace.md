---
description: Show the use case × slice × test × seq × ECB coverage matrix
argument-hint: [filters — see notes]
---

# /archik:trace — surface the Jacobson coverage matrix

The user wants to see how completely the project's use cases are
traced — for each slice: are tests declared, is a seq diagram
realising it, are participants ECB-tagged. Optional filter args:

**$ARGUMENTS**

## Steps

1. Run the trace CLI. If `$ARGUMENTS` is empty, full matrix:
   ```
   npx archik trace
   ```
   If the user passed a filter, pass it as a CLI flag — the flag form
   uses a SPACE, not `=`:
   ```
   npx archik trace --use-case <id>
   npx archik trace --actor <id>
   npx archik trace --status active|proposed|deprecated
   npx archik trace --coverage full|partial|none
   ```

2. **Read the totals row** at the bottom (`X full, Y partial, Z untraced`)
   and surface it in your reply as the headline answer:
   - **All full** → "✓ Every active slice is fully traced. Ready to ship."
   - **Any partial** → "◐ N partial slices — listed below; each is
     missing tests, a realisation seq, or full ECB tagging."
   - **Any untraced** → "○ N untraced slices — these slices declare
     neither tests nor a seq realisation. Address before milestone close."

3. **For each partial / untraced row**, narrate ONE concrete next
   action — e.g. "`pubmed-abstract-only` has tests but no seq —
   author `.archik/<slice>.archik.seq.yaml` with `realizes:
   { useCase: …, slice: pubmed-abstract-only }`".
   Don't dump raw rows; the user can read those in the CLI output if
   they want. Your job is to translate the matrix into actions.

4. **If everything is full**, also run `npx archik alpha show` and
   call out any alpha that's now eligible for promotion. The trace
   matrix is a major input to `requirements: addressed` and
   `softwareSystem: ready`.

## Notes

- The matrix is also visible on screen via the **Use cases** toolbar
  badge (rolled-up, "am I done?" answer) and the dedicated
  `/__archik/usecases` page (per-slice breakdown). Mention this if
  the user wants visual context.
- The check has CI teeth: `npx archik trace --fail-on partial`
  exits non-zero on any partial; `--fail-on none` exits non-zero on
  untraced only. Suggest the right flag for their CI gate if asked.
