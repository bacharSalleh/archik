---
description: Discard the pending suggestion
---

# /archik:reject — discard the pending suggestion and learn why

This is the **reject branch of the DECIDE gate** in the engineering
loop. A rejection without a follow-up question loses information and
forces a silent retry on the same flawed draft. Don't do that — the
loop's reject feedback edge is the whole point.

## Steps

1. **Discard the sidecar.** CLI only — never delete files manually:
   ```
   npx archik suggest reject
   ```
   Surface the result. If there was no pending sidecar, pass that
   message through unchanged and stop.

2. **Ask one specific clarifying question** before regenerating
   anything. Pick the axis that the rejection most likely hits — the
   user's answer becomes a hard constraint on the next draft. Pin it
   to one of:

   - **Boundary** — *"Did the wrong context own a node? Should
     `payments-worker` live under `orders` or under `billing`?"*
   - **Relationship** — *"Was a sync `http_call` wrong where you
     wanted async `publishes`/`subscribes` over a stream?"*
   - **Scope** — *"Too big? Want a smaller delta that only touches
     the queue, not the worker?"*
   - **Naming** — *"Was the id/name unclear? What would you call
     it?"*
   - **Composition** — *"Should this be one node, or split into a
     port + adapter pair?"*
   - **Lifecycle** — *"Should the new nodes be `status: proposed`
     until the code lands, or active now?"*

   Pick exactly one — the most likely fit given what was rejected.
   Add a fallback: *"Or tell me a different reason and I'll work from
   that."*

3. **Wait.** Do NOT regenerate the suggestion automatically. The
   user's answer to step 2 is what shapes the next attempt. When
   they reply, loop back to the **DESIGN** phase with the rejection
   reason as a hard constraint and re-stage via `/archik:suggest`.
