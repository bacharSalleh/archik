# Sequence Diagrams for Archik

**Date:** 2026-05-03  
**Status:** Approved — ready for implementation planning

---

## Problem

Archik's architecture diagram captures static structure: what nodes exist, what kind they are, how they connect. Engineers also need to model **temporal flows** — how those nodes interact over time for a specific scenario. Without sequence diagrams, teams reach for external tools (Mermaid, PlantUML, draw.io) that have no coupling to the architecture YAML, go stale, and break the shared-map contract archik is built on.

---

## Solution

A first-class sequence diagram feature, natively integrated into the archik engineering loop:

- A new `.archik.seq.yaml` file type with a Zod-validated schema
- Participants bound to existing architecture node ids (validated at `npx archik validate`)
- A purpose-built SVG renderer that shares archik's visual language (kind palette, icons, typography)
- A separate canvas route (`/__archik/seq?path=...`) reachable from the NodeInspector
- CLI commands for listing, validating, and rendering sequence files
- A distributable `CLAUDE.md` template with sequence diagram guidance baked in

---

## Schema

### File naming

`.archik.seq.yaml` — discovered by `validate` and `q sequences` automatically from the project root (same discovery mechanism as sub-architecture files).

### Document structure

```yaml
version: "1.0"
name: "User Login Flow"
description: "Covers the happy path and invalid-credentials branch."

participants:
  - id: browser
    nodeId: frontend          # REQUIRED — must reference an existing architecture node id
    label: "Browser"          # optional display override; defaults to the node's name

  - id: gw
    nodeId: api-gateway

  - id: auth
    nodeId: auth-service

steps:
  - type: message
    id: m1
    from: browser
    to: gw
    label: "POST /auth/login"
    arrow: sync               # sync | async | return | create | destroy
    activate: true            # show activation bar on receiver (default false)

  - type: group
    id: g1
    kind: alt                 # alt | opt | loop | par | break | ref
    condition: "[valid credentials]"
    branches:
      - label: "[valid]"
        steps:
          - type: message
            id: m2
            from: gw
            to: auth
            label: "validateToken()"
            arrow: sync
            activate: true
          - type: message
            id: m3
            from: auth
            to: gw
            label: "JWT"
            arrow: return
      - label: "[invalid]"
        steps:
          - type: message
            id: m4
            from: gw
            to: browser
            label: "401 Unauthorized"
            arrow: return

  - type: note
    id: n1
    position: over            # over | left_of | right_of
    participants: [gw, auth]
    text: "JWT minted and signed here"
```

### `ref` group (cross-sequence reference)

```yaml
- type: group
  id: g2
  kind: ref
  label: "See: refresh-token flow"
  seqFile: .archik/flows/refresh-token.archik.seq.yaml
  participants: [browser, gw]
```

### Zod schema additions

- `SeqParticipantSchema` — `id` (kebab-case), `nodeId` (IdSchema), optional `label`
- `SeqMessageSchema` — `type: "message"`, `id`, `from`, `to`, `label`, `arrow` enum, optional `activate`, optional `status` (proposed | active | deprecated)
- `SeqNoteSchema` — `type: "note"`, `id`, `position` enum, `participants` array, `text`, optional `status`
- `SeqGroupSchema` — `type: "group"`, `id`, `kind` enum, optional `condition`/`label`, `branches` (for alt/opt/loop/par/break) or `seqFile`+`participants` (for ref), optional `status`
- `SeqStepSchema` — discriminated union of the three above
- `SeqDocumentSchema` — `version`, `name`, optional `description`, `participants` array, `steps` array

### Validation rules (enforced in `superRefine`)

1. All `nodeId` values resolve to an existing node in the loaded architecture documents
2. All `from`/`to` in messages reference ids declared in `participants`
3. All `participants` arrays in notes reference declared participant ids
4. `ref` group `seqFile` path must exist on disk
5. All `id` values are unique within the document (same rule as architecture)
6. Self-calls (`from === to`) are valid — rendered as a looped arrow on the participant's own lifeline

### Architecture node link

New optional field on `NodeSchema`:

```yaml
seqFiles:
  - .archik/flows/login.archik.seq.yaml
  - .archik/flows/refresh-token.archik.seq.yaml
```

- Type: `z.array(SeqFilePathSchema).optional()`
- `SeqFilePathSchema` — same constraints as `ArchikFilePathSchema` but ending in `.archik.seq.yaml`
- Validation: each path must exist on disk (same hard rule as `sourcePath` for active nodes)

---

## Renderer

### Visual language

The sequence renderer shares archik's design tokens so the two canvases feel like one product:

| Element | Treatment |
|---|---|
| Participant header | Kind-colored chip (icon + name) from `kindPalette` — same component as compact node cards |
| Lifeline | Thin dashed vertical line, `--color-border` token |
| Activation bar | Filled rect on the lifeline, participant's kind color at 20% opacity |
| `sync` arrow | Solid line, filled triangle arrowhead |
| `async` arrow | Solid line, open arrowhead |
| `return` arrow | Dashed line, open arrowhead |
| `create` arrow | Dashed line, `<<create>>` label, arrowhead points to new participant header |
| `destroy` arrow | Solid line, × marker terminates the lifeline |
| Group frame | Rounded rect, colored tab top-left with kind label, dashed branch dividers |
| Note | Folded-corner shape, same font/size as node descriptions |
| `ref` group | Filled gray box spanning referenced participants, same affordance as sub-architecture drill-down |

### Layout algorithm

Vertical: top-down, messages laid out at fixed row height with padding for labels. Group frames expand to contain their children. No ELK dependency — the sequence layout is a simple top-down pass, not a graph layout problem.

Horizontal: participants spaced evenly based on column count, with minimum width per column derived from the widest label in that column.

### Route

`/__archik/seq?path=<encoded-path>` — served by the existing dev server handler. New `SequencePage` React component (parallel to the architecture `App`).

### Page layout

```
┌──────────────────────────────────────────────────┐
│  ← Architecture   [flow name]           Export   │  toolbar
├──────────────────────────────────────────────────┤
│  [Browser]    [API Gateway]    [Auth Service]    │  participant headers
│     │               │                │           │
│     │──POST /login──►               │           │
│     │               │──validate()───►           │
│     │               │◄──── JWT ──────│           │
│     │◄─── 200 ──────│               │           │
└──────────────────────────────────────────────────┘
```

- **"← Architecture"** navigates back to the architecture canvas. The seq page encodes the originating architecture `viewKey` as a `?from=<viewKey>` URL param so the architecture canvas can restore scroll/zoom on return (read from the URL, passed to the existing in-memory `viewKey` map)
- **Export** reuses `ExportMenu` (PNG + SVG)
- Pan + zoom via shared hook extracted from the existing Canvas scroll/wheel logic

### NodeInspector integration

When the selected node has `seqFiles`, the `NodeInspector` panel gains a **"Sequence Diagrams"** section listing each file as a clickable chip. Clicking navigates to `/__archik/seq?path=...` (same tab, `window.location`).

---

## CLI

| Command | Description |
|---|---|
| `npx archik validate` | Extended to discover and validate `.archik.seq.yaml` files automatically |
| `npx archik q sequences [--node <id>] [--json]` | List all seq files; `--node` filters to files where that node id appears as a participant |
| `npx archik render --seq <path> --out <file>` | Headless SVG export of a sequence diagram |
| `npx archik schema seq` | Print the sequence schema (parallel to existing `schema` command) |

---

## Engineering Loop Integration

### DISCOVER phase addition

```
npx archik q sequences           — list all sequence flows in the project
npx archik q sequences --node X  — flows that involve node X
```

Read these before proposing changes to a flow, same discipline as `npx archik q list` before proposing architecture changes.

### DESIGN phase

New seq files are drafted as `.archik.seq.yaml` with `status` omitted (defaults to active) or individual messages/groups marked `status: proposed` for greenfield work. The `seqFiles` link on the architecture node is staged in a sidecar (`npx archik suggest set`) alongside any architecture changes.

### VERIFY phase

`npx archik validate` catches:
- Broken `nodeId` refs (architecture node renamed or deleted)
- Missing `seqFiles` paths on disk
- Orphaned participant ids in messages/notes

This is the sequence-diagram equivalent of drift: rename `auth-service` in the architecture YAML and `validate` immediately flags every seq file that referenced it.

---

## Template file

A distributable `docs/templates/CLAUDE.md` is the canonical engineering loop template with sequence diagram guidance baked in. It is the source of truth for the template; the project's root `CLAUDE.md` stays in sync with it.

`npx archik init` is extended to copy this template as `CLAUDE.md` into new projects (alongside the existing `.archik/main.archik.yaml` scaffold). Projects that already have a `CLAUDE.md` are not overwritten — init prints a note to manually merge.

The template adds to the existing sections:

**"Archik commands I use":**
```
- `npx archik q sequences [--node <id>]` — list sequence flows
- `npx archik render --seq <path> --out <file>` — preview a flow as SVG
```

**"Common pitfalls":**
```
- Authoring a seq file whose participants reference node ids that don't exist in the
  architecture — always run `npx archik validate` after creating a new seq file.
- Renaming an architecture node without updating seq file participant `nodeId` bindings
  — validate catches this, but fix it before committing.
```

**New "Per-milestone rhythm" note:**
```
When a milestone adds or changes a flow: stage the seq file change (draft or edit the
.archik.seq.yaml), render it with `npx archik render --seq` for the visual ack, then
update the seqFiles link on the relevant architecture node via `npx archik suggest set`.
```

---

## Out of scope

- Drift detection on sequence diagrams (checking that seq file messages match actual code call sites) — future milestone
- Editing sequence diagrams from the canvas UI — CLI + text editor authoring only for now
- Auto-generating seq files from code (tracing, OpenTelemetry) — future milestone
- Multiple seq files open simultaneously — single-file view only

---

## Milestones

1. **Schema** — `SeqDocumentSchema` Zod schema, `seqFiles` field on `NodeSchema`, `validate` integration
2. **Renderer** — `SequenceRenderer` SVG component (participants + lifelines + messages + activation bars)
3. **Groups + notes** — `alt/opt/loop` frames, `par/break`, notes, `ref` groups
4. **Canvas route** — `SequencePage`, dev server handler, NodeInspector chips, back-navigation
5. **CLI** — `q sequences`, `render --seq`, `schema seq`
6. **Template** — `docs/templates/CLAUDE.md`, `npx archik init` extension
