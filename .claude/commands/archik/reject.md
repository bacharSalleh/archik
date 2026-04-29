---
description: Discard the pending suggestion
---

# /archik:reject — discard the pending suggestion

The user wants to throw away the pending architecture suggestion.

Run the CLI — do NOT delete files manually:

```
npx archik suggest reject
```

Surface the result to the user. If there was no pending sidecar, the
command will say so — pass that through unchanged.
