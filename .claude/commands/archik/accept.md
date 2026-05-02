---
description: Apply the pending suggestion
---

# /archik:accept — apply the pending suggestion and run BUILD → VERIFY

This is the **accept branch of the DECIDE gate** in the engineering
loop, and it opens the **BUILD** and **VERIFY** phases. Don't claim
done at step 1 — the diagram changed; the code probably hasn't.

## Steps

1. **Apply the sidecar.** CLI only — never edit any archik file by
   hand:
   ```
   npx archik suggest accept
   ```
   If it exits non-zero, surface the error verbatim and stop. Don't
   try to fix the sidecar by editing it; ask the user how to proceed.

2. **Validate the merged main file.**
   ```
   npx archik validate
   ```
   If validation fails after accept, that's a bug — surface the
   error and stop.

   If the accepted change has **no code impact** (rename inside a
   non-code-bearing kind, description-only edit, pure metadata),
   skip steps 3–6 and jump straight to step 7.

3. **BUILD — plan (HITL).** Translate the diagram delta into a
   numbered file-level plan and present it for approval **before**
   touching code:
   - Each new code-bearing node (`service`, `function`, `worker`,
     `module`, `page`, `component`, `store`, `hook`) → its
     `sourcePath` and the concrete files / signatures to land there.
   - Each new edge that requires code → the corresponding code
     change (a new `http_call` needs a client; `subscribes` needs a
     consumer handler; `writes` needs a repository method; etc).
   - Any node still `status: proposed` → flag it; code must land
     before flipping to `active`.
   - Default to **tests-first** when behaviour is clearly bounded.
   - If `superpowers:writing-plans` is available, use it; else
     inline.

   End with: *"Approve the plan and I'll implement it, or push back
   on any step."* Do NOT start coding until approved.

4. **BUILD — implement.** Small reversible commits, one diagram
   delta per commit where practical, no drive-by refactors.
   `superpowers:test-driven-development` when available.

   **Back-edge to DESIGN:** if implementation reveals the diagram is
   wrong (a missing port, a hidden dependency, a boundary that
   doesn't hold), STOP. Open a fresh `/archik:suggest` to fix the
   diagram first, then resume. Don't paper over it.

5. **BUILD — self-review.** Before claiming done:
   - Each new file matches its node's `sourcePath`?
   - Each new edge corresponds to a real call/handler/query?
   - Bounded-context boundaries respected (no sneaky cross-context
     imports)?
   - Tests cover the new behaviour, not just the happy path?
   - Any new dependency that isn't in the diagram → drift; queue a
     follow-up `/archik:suggest`.

   `superpowers:requesting-code-review` when available.

6. **VERIFY.** Evidence before assertions:
   ```
   npx archik validate
   ```
   Plus the project's tests / typecheck / lint.
   `superpowers:verification-before-completion` when available.
   If `docs/architecture.svg` is committed, regenerate it:
   ```
   npx archik render --out docs/architecture.svg
   ```

7. **Close the loop.** End with one concrete next-step offer, not
   "done":
   - *"This module wires into four services — worth running
     `/archik:evolve` to see if the boundaries can be cleaner?"*
   - *"Want me to schedule a drift check in two weeks?"*
   - *"This left `payments-worker` as `status: proposed` — flip it
     to `active` once deployed."*
