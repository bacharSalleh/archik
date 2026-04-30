# Architecture Drift Detection (`archik drift`)

## Problem

Architecture diagrams go stale as code evolves. Engineers add services, rename modules, delete workers — and forget to update the archik YAML. There is no mechanism to detect when the diagram no longer matches reality.

## Solution

A new `archik drift` CLI command that compares the archik YAML against the actual source tree and reports mismatches. It acts as a "test suite for your architecture docs."

## Schema changes

Two new optional fields on `Node`:

### `sourcePath` (optional string)

Relative path from project root to the node's source code. Can be a directory (trailing `/`) or a file.

```yaml
nodes:
  - id: orders-service
    kind: service
    name: Orders Service
    sourcePath: src/services/orders/
```

Nodes without `sourcePath` are skipped by drift entirely. Typical for infrastructure-level nodes (external APIs, cloud services) that have no local code.

### `status` (optional enum: `proposed` | `active` | `deprecated`)

Defaults to `active` when absent. Controls whether drift checks the node.

```yaml
- id: payments-worker
  kind: worker
  name: Payments Worker
  sourcePath: src/workers/payments/
  status: proposed        # not built yet, drift skips

- id: legacy-cache
  kind: cache
  name: Legacy Cache
  sourcePath: src/cache/legacy/
  status: deprecated      # being removed, drift skips
```

Values:
- `active` (default) — drift checks this node
- `proposed` — planned but not yet built, drift skips
- `deprecated` — being phased out, drift skips

## Detection logic

### Orphan nodes

A node is flagged as **ORPHAN** when all of these are true:
1. Has a `sourcePath` set
2. Has `status: active` (or no status — active is default)
3. The path does not exist on disk

Output: `ORPHAN  payments-worker  sourcePath src/workers/payments/ not found`

### Unmapped code

A source directory is flagged as **UNMAPPED** when:
1. It is a top-level directory under `src/`, `services/`, `packages/`, or `apps/`
2. No active node's `sourcePath` covers it
3. It is not matched by `.driftignore`

Output: `UNMAPPED  src/workers/notifications/  no archik node claims this path`

### What drift ignores

- Nodes without `sourcePath`
- Nodes with `status: proposed` or `status: deprecated`
- Paths matched by `.archik/.driftignore`

## Driftignore

File: `.archik/.driftignore`

One glob pattern per line. `#` comments supported. Applied to unmapped code paths.

```
# Infrastructure
src/db/migrations/**
terraform/**

# Generated code
**/*.generated.*
```

## Command interface

```
npx archik drift [path]
  --json           structured output for CI / agents
  --ignore <file>  custom ignore file (default: .archik/.driftignore)
```

### Human-readable output (default)

```
$ npx archik drift

2 ORPHANS — nodes with no matching code
  x payments-worker     sourcePath src/workers/payments/ not found
  x legacy-cache        sourcePath src/cache/legacy/ not found

3 UNMAPPED — code with no matching node
  x src/workers/notifications/
  x src/services/analytics/
  o src/db/migrations/    (matched .driftignore)

archik drift: 4 issues found (1 ignored)
```

### JSON output (`--json`)

```json
{
  "orphan": [
    {"id": "payments-worker", "sourcePath": "src/workers/payments/"},
    {"id": "legacy-cache", "sourcePath": "src/cache/legacy/"}
  ],
  "unmapped": [
    {"path": "src/workers/notifications/"},
    {"path": "src/services/analytics/"}
  ],
  "ignored": [
    {"path": "src/db/migrations/", "pattern": "src/db/migrations/**"}
  ],
  "summary": {"orphan": 2, "unmapped": 2, "ignored": 1, "total": 4}
}
```

### Exit codes

- `0` — no drift (or only ignored items)
- `1` — drift detected (orphans or unmapped code)

## Files to create/modify

| File | Purpose |
|------|---------|
| `src/domain/schema.ts` | Add `sourcePath` (optional string) and `status` (optional enum) to Node schema |
| `src/domain/types.ts` | Update TypeScript Node type |
| `src/drift/detector.ts` | Core orphan + unmapped detection logic |
| `src/drift/driftignore.ts` | Parse `.driftignore` glob patterns |
| `src/drift/detector.test.ts` | Unit tests for detection logic |
| `src/drift/driftignore.test.ts` | Unit tests for ignore parsing |
| `src/cli/commands/drift.ts` | CLI command entry point, output formatting |
| `src/cli/commands/drift.test.ts` | CLI integration tests |
| `src/cli/index.ts` | Register `drift` command |
| `src/cli/commands/schema.ts` | Update schema output to include new fields |

## Validation rules

- `sourcePath` must be a relative path (no leading `/`, no `..`)
- `status` must be one of `proposed`, `active`, `deprecated`
- `sourcePath` can be set on any node kind
- `status` without `sourcePath` is valid (e.g., marking a node as proposed before deciding where code will live)

## Out of scope (v2)

- Import analysis for edge drift detection
- HTTP route / API call scanning for `routes_to` edges
- Database connection scanning for `reads`/`writes` edges
- Language-specific parsers (JS/TS, Python, Go)
- GitHub Action wrapper (can be done separately without code changes)
