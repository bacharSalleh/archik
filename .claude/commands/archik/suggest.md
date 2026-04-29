---
description: Propose diagram changes from a feature description
argument-hint: <feature description>
---

# /archik:suggest — propose architecture changes

The user wants you to capture the structural impact of a feature in
the archik diagram. The user-facing description is:

**$ARGUMENTS**

This slash command IS the user's confirmation that they want a
sidecar suggestion. Skip the "want me to update the YAML?" question
and produce one now.

## CLI-only — do not touch archik files directly

You MUST interact with archik exclusively through the `npx archik`
CLI. Do NOT use Read, Write, or Edit on any file under `.archik/`,
on `architecture.archik.yaml`, or on any sidecar. The CLI is the
sanctioned interface; everything else is a manual edit and breaks
the contract with the user.

## Steps

1. **Make sure the canvas is running** so the user can review:
   ```
   npx archik status
   ```
   If nothing is running for this project, start it detached:
   ```
   npx archik start
   ```
   Note the URL it prints — you'll surface it at the end.

2. **Ground yourself in the current diagram** using the query CLI
   (do not `cat` the YAML):
   ```
   npx archik q stats
   npx archik q list
   ```
   If `$ARGUMENTS` mentions a specific node by name, also run
   `npx archik q describe <id>` for it.

3. **Author the draft** in a workspace temp file (NOT under
   `.archik/`). Use the path `/tmp/archik-draft-<short-id>.yaml`.
   The draft is the *full proposed end-state* of the document — every
   node and edge, not just the delta. Follow the schema, kinds, and
   relationships documented in the archik skill.

4. **Stage the draft as the sidecar via the CLI**:
   ```
   npx archik suggest set /tmp/archik-draft-<id>.yaml --note "$ARGUMENTS"
   ```
   This validates the schema, checks cross-file references, stamps
   `metadata.suggestion`, and atomically renames it into place. If
   the command exits non-zero, fix the reported errors in the temp
   file and re-run — never edit the sidecar directly.

5. **Tell the user how to review**. Surface the canvas URL from
   step 1 plus the terminal options:
   - "📝 Suggestion ready — open the canvas at <URL> and use the
     **Review** banner to see added/removed/changed nodes."
   - "Or from the terminal: `npx archik suggest show` /
     `npx archik suggest accept` / `npx archik suggest reject`."

## Notes

- If a sidecar already exists, `suggest set` overwrites it. Mention
  to the user that you replaced their previous pending suggestion.
- If `npx archik` is unreachable (offline, sandboxed), STOP and tell
  the user. Do not fall back to writing YAML by hand.
