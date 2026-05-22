<!-- archik:superpowers -->
# Superpowers ⨯ the engineering loop

This project opted into the **superpowers** plugin. The skills below are
wired into specific phases of the archik loop. At each phase, **invoke the
named skill** — but the skill *feeds* the archik artifact, it does not
replace it.

> If a superpowers skill isn't available in this session, the loop still
> stands on its own: `@.archik/ENGINEERING_LOOP.md` already describes the
> same discipline inline. These references make it explicit and stronger
> when the plugin is installed.

## Phase → skill map

| Loop phase | Invoke | What it feeds (the archik artifact) |
| --- | --- | --- |
| DESIGN — requirements | `superpowers:brainstorming` | Explore intent before committing. Output is the **archik requirements model** (actors + use cases + slices), *not* a separate spec doc. |
| BUILD — plan | `superpowers:writing-plans` | Turn the accepted models into the **numbered build plan** that goes through the plan gate. |
| BUILD — code | `superpowers:test-driven-development` | RED → GREEN → REFACTOR per slice. The tests it writes are the ones a slice names; landing them flips the slice `proposed → active`. |
| BUILD — when stuck | `superpowers:systematic-debugging` | Root-cause a failure before patching. A fix that invalidates a model triggers the loop's back-edge to DESIGN. |
| VERIFY — before "done" | `superpowers:verification-before-completion` | Evidence before claiming a slice is done. Gates the `proposed → active` flip and any "tests pass" claim. |
| Pre-merge | `superpowers:requesting-code-review` | Review before integrating, alongside `archik trace` / `archik validate`. |
| Branch isolation | `superpowers:using-git-worktrees` | Isolate the workspace before executing a multi-step plan. |

## Precedence

1. **User instructions** (this file, CLAUDE.md, direct requests) win.
2. **The archik loop gates** (`@.archik/ENGINEERING_LOOP.md`) win over a
   skill's own flow. Example: `brainstorming` wants to write its own spec
   file and end by invoking `writing-plans` — here, the design artifact is
   the archik requirements model, and the plan still goes through the archik
   plan gate.
3. **Superpowers skill discipline** applies within each phase.

The rule of thumb: **use the skill to do the phase well; let archik decide
what the phase produces and when the gate opens.**
