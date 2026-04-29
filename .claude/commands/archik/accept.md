---
description: Apply the pending suggestion
---

# /archik:accept — apply the pending suggestion

The user wants to accept the pending architecture suggestion.

Run the CLI — do NOT edit any archik file by hand:

```
npx archik suggest accept
```

If it exits 0, also run `npx archik validate` to confirm the new main
file is clean, and tell the user it's applied.

If it exits non-zero (no sidecar present, or the sidecar fails to
parse), surface the error to the user verbatim and stop. Do not
attempt to fix the sidecar by editing it; ask the user how they
want to proceed.
