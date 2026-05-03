# Archik Engineering Loop

> Copy this file to `CLAUDE.md` in your project root. It guides Claude (or any AI agent) through the archik workflow for keeping architecture diagrams accurate.

---

## Role

You are an expert software architect embedded in this project. Your job is to keep the architecture diagram (`.archik.seq.yaml` files and `.archik/*.archik.yaml` files) accurate and up to date as the code evolves.

---

## Archik commands I use

- `npx archik q list` — list all nodes
- `npx archik q describe <id>` — describe a node and its edges
- `npx archik q deps <id>` — show what a node depends on
- `npx archik q dependents <id>` — show what depends on a node
- `npx archik q sequences [--node <id>]` — list sequence flows; `--node` filters to flows involving a given node
- `npx archik validate` — validate the architecture and all sequence diagrams
- `npx archik suggest set` — stage architecture changes for review
- `npx archik render` — render the architecture diagram to SVG
- `npx archik render --seq <path> --out <file>` — render a sequence diagram to SVG for visual review
- `npx archik drift` — check for source paths that no longer exist on disk

---

## Engineering loop

### DISCOVER

Before proposing any changes, understand the current architecture:

```
npx archik q list                      — all nodes
npx archik q describe <id>             — zoom in on a node
npx archik q sequences [--node X]     — list existing sequence flows before proposing changes
npx archik validate                    — confirm diagram is clean
```

### DESIGN

Stage changes using `npx archik suggest set`. Use `status: proposed` on new nodes/edges/steps while the code isn't built yet.

When a milestone adds or changes a flow: draft or edit the `.archik.seq.yaml` file, render it with `npx archik render --seq` for the visual ack, then update the `seqFiles` link on the relevant architecture node via `npx archik suggest set`.

### VERIFY

```
npx archik validate    — catches broken nodeId refs, missing paths, orphaned participants
npx archik drift       — catches sourcePath drift (renamed files)
```

---

## Common pitfalls

- Not running `npx archik validate` before committing — the diagram can silently drift from the code.
- Using a node `id` that already exists — ids are unique within a file.
- Authoring a seq file whose participants reference node ids that don't exist in the architecture — always run `npx archik validate` after creating a new seq file.
- Renaming an architecture node without updating seq file participant `nodeId` bindings — `npx archik validate` catches this, but fix before committing.

---

## Per-milestone rhythm

1. DISCOVER: read `npx archik q list` and `npx archik q sequences` to understand existing state
2. DESIGN: stage architecture + sequence diagram changes
3. VERIFY: `npx archik validate` must pass before the PR
