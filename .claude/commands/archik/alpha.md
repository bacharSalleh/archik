---
description: Show alpha state snapshot, or promote one with criteria check
argument-hint: [show | promote <alpha> <state> | demote <alpha> <state>]
---

# /archik:alpha — read or move project alphas

Alphas (Essence / SEMAT) are the universal progress dials of the
project. The user wants either a snapshot of all alphas, or a
deliberate promotion / demotion with the underlying criteria
verified mechanically. Argument:

**$ARGUMENTS**

## Branches

### No args / `show`

Run:
```
npx archik alpha show
```

Read the table. For each alpha:
- `✓` means the claimed state is satisfied by the current artifacts
- `?` means the state can't be fully verified (manual review needed)
- `✗ over-claimed` means the artifacts don't meet the criteria —
  surface this as a blocker

Translate the table into a short paragraph: which alphas are honest,
which are over-claimed, and what one concrete next action would
unblock the most progress (usually whichever alpha is closest to
its next state and just needs one more artifact).

### `promote <alpha> <state>`

Run the promotion (it runs the criteria check first and refuses if
the state isn't satisfied):
```
npx archik alpha promote <alpha> <state>
```

If it succeeds, narrate which evidence satisfied the criteria. If it
refuses, name the specific criterion that failed and the concrete
artifact that would satisfy it (e.g. "to promote `requirements` to
`addressed`, every active slice needs `realization.seqFile` — slice
X currently has none. Author `.archik/X.archik.seq.yaml` with
`realizes: { useCase, slice }` and re-run.").

### `demote <alpha> <state>`

```
npx archik alpha demote <alpha> <state> --note "<reason>"
```

Demotion is a deliberate admission that the project no longer meets
a previously-claimed state. Always prompt for the `--note` reason if
the user didn't supply one — the audit trail matters.

## Notes

- Alphas tracked: `stakeholders`, `requirements`, `softwareSystem`,
  `work` (the four Essence alphas most directly evidenced by archik
  artifacts). State ladders match the Essence kernel — see
  `npx archik alpha show --json` for the full enum.
- The alpha file lives at `.archik/alphas.archik.alphas.yaml` —
  direct-write only via this command (or the underlying CLI). Don't
  edit it by hand; the criteria check is the discipline.
- Over-claiming is fixed by EITHER advancing artifacts OR demoting
  the state. Whichever is easier given the project's actual
  trajectory. Don't fudge.
