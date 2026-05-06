---
description: Start here — detect project state and kick off the right archik loop
argument-hint: [optional one-line brief]
---

# /archik:bootstrap — first command on a fresh project

The user just installed archik and wants to start using it but
doesn't know what to type first. **Detect the project's current
state, then route to the right next action**. Optional inline brief:

**$ARGUMENTS**

## Steps

1. **Check current state.** Don't assume — actually inspect:

   ```sh
   ls .archik/main.archik.yaml 2>/dev/null && echo HAS_ARCHIK || echo NO_ARCHIK
   ```

   And see whether there's any code worth modeling (don't pattern-
   match on framework files — actually look):

   ```sh
   ls src/ lib/ app/ packages/ 2>/dev/null | head -20
   ```

2. **Route based on what you found.** There are exactly four cases.
   Pick the one that matches and follow its branch — don't run more
   than one.

### A. No `.archik/` yet, no source code (empty / scratch project)

This is a **fresh project**. The user wants to build something but
hasn't written any code. Run `archik init` first, then ask for a
brief and start the DESIGN loop.

1. Confirm with the user once before writing anything:
   > "I see this is a fresh project. I'll scaffold archik, then ask
   > for a one-paragraph brief so I can model the actors and your
   > first use case. Sound right?"
2. On confirmation, run:
   ```sh
   npx archik@latest init
   ```
3. If `$ARGUMENTS` already contains a brief, treat it as the brief
   and skip step 4. Otherwise:
4. **Ask for the brief**, in this exact shape (so the user knows
   what fields you actually need). The closing line is the load-
   bearing one — it commits the conversation to actors-first +
   pick-exactly-one + ship-it-with-tests, which is the framing
   that makes the rest of the loop work:
   > "Send me a project brief in this shape (skip any line that
   > doesn't apply):
   >
   > **What:** one sentence on what you're building.
   > **Why:** the problem it solves / who it's for.
   > **Stack:** language, framework, hosting.
   > **Constraints:** budget, deadline, team size, hard-no's.
   > **Out of scope:** things you explicitly DON'T want.
   >
   > **Then end with:** *'Start by modelling the actors and the
   > first use case I should ship.'* — that single line is what
   > forces priorities into the open before any code lands. The
   > use case names its test paths from message one; slices start
   > `status: proposed` (because the tests don't exist on disk
   > yet) and flip to `status: active` automatically when the
   > tests land in BUILD. The commitment lives in the YAML, not
   > in the chat log."
5. When the brief lands, run the standard DESIGN loop:
   `/archik:actor` (if needed) → `/archik:usecase` → `/archik:suggest`
   (structural sidecar) → behavioural seq files. Stop at each
   inline-review gate; don't barrel through.

### B. No `.archik/` yet, but source code exists (existing project)

The user has a codebase but no diagram yet. The right starting
point is `/archik:spawn` — mirror what's there as the first-pass
diagram, then iterate from honest ground truth.

1. Note what you see briefly:
   > "I see existing code under `src/` (and / `lib/` / `app/` etc.).
   > Best starting point is `/archik:spawn` — I'll mirror your real
   > source tree as the first diagram so we begin from honest
   > ground truth, not a clean-slate fantasy."
2. Run:
   ```sh
   npx archik@latest init
   ```
   (init also installs the slash commands and skill if they're
   missing.)
3. Then immediately run the `/archik:spawn` workflow — see
   `.claude/commands/archik/spawn.md` for the steps. Don't
   duplicate them here.
4. After the user accepts the spawn sidecar, suggest the natural
   follow-up: "Want to author the first use case for what you're
   actively working on right now? `/archik:usecase <name>`."

### C. `.archik/` exists but the diagram is empty or near-empty

Someone ran `init` but nothing else. Treat this like case A or B
based on whether there's source code:

- No source code → ask for a brief (case A from step 3 onward)
- Source code present → suggest `/archik:spawn` (case B from
  step 3 onward)

Skip the `init` step in both — the file already exists.

### D. `.archik/main.archik.yaml` already has nodes (modelled project)

The project is already running the loop. Don't re-bootstrap. Surface
the current state and let the user pick the next move:

1. Run two queries to ground the user in where they are:
   ```sh
   npx archik q stats
   npx archik trace
   ```
2. Translate the trace totals into one sentence: "X full slices,
   Y partial, Z untraced." Name the worst-case slice if any.
3. Suggest the next action based on state:
   - **All traced** → "Ready to ship. Want to add a feature?
     `/archik:suggest <feature>`. Or start a new use case?
     `/archik:usecase <name>`."
   - **Partial / untraced** → "The biggest gap is `<slice-id>`
     — it's missing `<thing>`. Want me to fix it?"

## Notes

- This command is the user's "I just installed archik, what now?"
  answer. Keep your routing decision visible: state which case you
  detected and why before acting, so the user can correct you if
  the project state is misleading (e.g. they have a `src/` that's
  pure assets, or an empty `.archik/main.archik.yaml`).
- Don't skip `init` if it's needed. The slash commands rely on
  `npx archik` being callable from the project root, and `init`
  also makes sure the skill + slash commands are installed.
- **Do not** start writing actors / use cases / sidecars before
  the user replies to your "sound right?" check. Bootstrap is the
  one place where confirming-before-acting is more important than
  speed — the user is still calibrating what archik will do.
