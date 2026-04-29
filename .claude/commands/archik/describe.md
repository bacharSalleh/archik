---
description: Show a node's connections
argument-hint: <node-id>
---

# /archik:describe — explain a node from the archik diagram

The user wants details about the node with id **$ARGUMENTS**.

Use the query CLI — do NOT `cat` or read any archik YAML directly:

```
npx archik q describe $ARGUMENTS
```

If you need adjacent context, also run:

```
npx archik q deps $ARGUMENTS
npx archik q dependents $ARGUMENTS
```

Summarize what came back in plain prose: the node's kind and stack,
what it depends on, what depends on it, and any responsibilities or
notes. Don't dump the raw CLI output unless the user asks for it.

If the CLI exits 1 (unknown id), tell the user and offer to run
`npx archik q list` to find the right id.
