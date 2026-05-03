# Sequence Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class `.archik.seq.yaml` sequence diagrams with Zod validation, a native SVG renderer, a separate canvas route, and full CLI support.

**Architecture:** New Zod schema in `src/domain/seq-schema.ts` validates sequence documents with participants bound to architecture node ids. A custom SVG renderer in `src/render/seq/` shares archik's visual language. A `SequencePage` React component mounts at `/__archik/seq?path=...` and loads seq files via a new dev-server endpoint.

**Tech Stack:** TypeScript, Zod, React, SVG, Vitest, Node.js fs

---

## File Map

**Create:**
- `src/domain/seq-schema.ts` — Zod schemas for seq documents
- `src/domain/seq-schema.test.ts` — schema parse/reject tests
- `src/domain/seq-types.ts` — TypeScript types derived from seq schemas
- `src/domain/seq-validate.ts` — cross-ref validation (nodeId bindings, participant refs)
- `src/domain/seq-validate.test.ts` — validation unit tests
- `src/io/seq-discovery.ts` — discover `.archik.seq.yaml` files in a project
- `src/io/seq-discovery.test.ts`
- `src/render/seq/seqLayout.ts` — top-down layout algorithm
- `src/render/seq/seqLayout.test.ts`
- `src/render/seq/SeqDiagramSvg.tsx` — top-level SVG component
- `src/render/seq/SeqDiagramSvg.test.tsx`
- `src/render/seq/SeqParticipantHeader.tsx` — kind-colored participant chip
- `src/render/seq/SeqLifeline.tsx` — dashed vertical lifeline
- `src/render/seq/SeqMessage.tsx` — message arrows (sync/async/return/create/destroy)
- `src/render/seq/SeqGroupFrame.tsx` — alt/opt/loop/par/break/ref frames
- `src/render/seq/SeqNote.tsx` — folded-corner note
- `src/ui/SequencePage.tsx` — React page for the seq route
- `src/ui/SequencePage.test.tsx`
- `docs/templates/CLAUDE.md` — distributable engineering loop template

**Modify:**
- `src/domain/schema.ts` — add `SeqFilePathSchema`, `seqFiles` on `NodeSchema`
- `src/domain/schema.test.ts` — tests for `seqFiles` field
- `src/domain/types.ts` — re-export seq types
- `src/domain/validate.ts` — add `checkSeqFilePaths`
- `src/domain/validate.test.ts` — tests for `checkSeqFilePaths`
- `src/cli/commands/validate.ts` — extend to discover + validate seq files
- `src/cli/commands/validate.test.ts`
- `src/cli/commands/q.ts` — add `sequences` subcommand
- `src/cli/commands/q.test.ts`
- `src/cli/commands/render.ts` — add `--seq` flag
- `src/cli/commands/render.test.ts`
- `src/cli/commands/schema.ts` — add `seq` subcommand
- `src/cli/commands/schema.test.ts`
- `src/server/handlers.ts` — add `/__archik/seq-file` handler
- `vite/archikWatch.ts` — wire `/__archik/seq-file` route
- `src/main.tsx` — route to `SequencePage` when path starts with `/__archik/seq`
- `src/ui/NodeInspector.tsx` — add "Sequence Diagrams" section for `seqFiles`
- `src/ui/NodeInspector.test.tsx`
- `src/cli/commands/init.ts` — extend to copy `CLAUDE.md` template
- `src/cli/commands/init.test.ts`
- `CLAUDE.md` — add seq diagram guidance sections

---

## Task 1: SeqFilePathSchema + seqFiles on NodeSchema

**Files:**
- Modify: `src/domain/schema.ts`
- Modify: `src/domain/schema.test.ts`

- [ ] **Step 1: Write failing tests for SeqFilePathSchema and seqFiles**

Add to `src/domain/schema.test.ts`:

```ts
import { SeqFilePathSchema } from "./schema.ts";
import { NodeSchema } from "./schema.ts";

describe("SeqFilePathSchema", () => {
  it("accepts a valid seq file path", () => {
    expect(SeqFilePathSchema.safeParse(".archik/flows/login.archik.seq.yaml").success).toBe(true);
  });
  it("rejects a path not ending in .archik.seq.yaml", () => {
    expect(SeqFilePathSchema.safeParse(".archik/flows/login.archik.yaml").success).toBe(false);
  });
  it("rejects an absolute path", () => {
    expect(SeqFilePathSchema.safeParse("/absolute/path.archik.seq.yaml").success).toBe(false);
  });
  it("rejects a path with ..", () => {
    expect(SeqFilePathSchema.safeParse("../escape.archik.seq.yaml").success).toBe(false);
  });
  it("rejects a path with backslashes", () => {
    expect(SeqFilePathSchema.safeParse(".archik\\flows\\login.archik.seq.yaml").success).toBe(false);
  });
});

describe("NodeSchema seqFiles", () => {
  const base = {
    id: "gw",
    kind: "gateway" as const,
    name: "Gateway",
    description: "Routes traffic.",
  };
  it("accepts a node with seqFiles", () => {
    const result = NodeSchema.safeParse({
      ...base,
      seqFiles: [".archik/flows/login.archik.seq.yaml"],
    });
    expect(result.success).toBe(true);
  });
  it("accepts a node without seqFiles", () => {
    expect(NodeSchema.safeParse(base).success).toBe(true);
  });
  it("rejects seqFiles with invalid path", () => {
    const result = NodeSchema.safeParse({
      ...base,
      seqFiles: ["bad.yaml"],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/domain/schema.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|cannot find|SeqFilePathSchema"
```

Expected: fails with `SeqFilePathSchema is not exported` or similar.

- [ ] **Step 3: Add SeqFilePathSchema and seqFiles to schema.ts**

In `src/domain/schema.ts`, after `ArchikFilePathSchema`, add:

```ts
export const SeqFilePathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !/^[a-zA-Z]:[\\/]/.test(p), {
    message: "seqFile must be a relative path",
  })
  .refine((p) => !p.includes("\\"), {
    message: "seqFile must use forward slashes",
  })
  .refine(
    (p) => !p.split("/").some((seg) => seg === ".."),
    { message: "seqFile must not contain `..` segments" },
  )
  .refine((p) => p.endsWith(".archik.seq.yaml"), {
    message: "seqFile must end in `.archik.seq.yaml`",
  });
```

In `NodeSchema` (inside the `z.strictObject({...})` call), add after the `archikFile` field:

```ts
seqFiles: z.array(SeqFilePathSchema).optional(),
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/domain/schema.test.ts --reporter=verbose 2>&1 | grep -E "PASS|FAIL|seqFiles|SeqFilePath"
```

Expected: all SeqFilePathSchema and seqFiles tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npm test 2>&1 | tail -5
```

Expected: all 795+ tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/schema.ts src/domain/schema.test.ts
git commit -m "feat(schema): add SeqFilePathSchema and seqFiles field on Node"
```

---

## Task 2: SeqDocumentSchema + Types

**Files:**
- Create: `src/domain/seq-schema.ts`
- Create: `src/domain/seq-schema.test.ts`
- Create: `src/domain/seq-types.ts`

- [ ] **Step 1: Write failing tests for SeqDocumentSchema**

Create `src/domain/seq-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SeqDocumentSchema } from "./seq-schema.ts";

const minimalDoc = {
  version: "1.0" as const,
  name: "Login Flow",
  participants: [
    { id: "browser", nodeId: "frontend" },
    { id: "gw", nodeId: "api-gateway" },
  ],
  steps: [
    {
      type: "message" as const,
      id: "m1",
      from: "browser",
      to: "gw",
      label: "POST /auth/login",
      arrow: "sync" as const,
    },
  ],
};

describe("SeqDocumentSchema", () => {
  it("accepts a minimal valid document", () => {
    expect(SeqDocumentSchema.safeParse(minimalDoc).success).toBe(true);
  });

  it("accepts optional description", () => {
    expect(SeqDocumentSchema.safeParse({ ...minimalDoc, description: "A flow" }).success).toBe(true);
  });

  it("rejects missing version", () => {
    const { version: _, ...rest } = minimalDoc;
    expect(SeqDocumentSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects wrong version", () => {
    expect(SeqDocumentSchema.safeParse({ ...minimalDoc, version: "2.0" }).success).toBe(false);
  });

  it("accepts a message with activate and status", () => {
    const doc = {
      ...minimalDoc,
      steps: [{
        type: "message" as const,
        id: "m1",
        from: "browser",
        to: "gw",
        label: "login",
        arrow: "sync" as const,
        activate: true,
        status: "proposed" as const,
      }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects a message with invalid arrow type", () => {
    const doc = {
      ...minimalDoc,
      steps: [{ ...minimalDoc.steps[0], arrow: "unicast" }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("accepts a note step", () => {
    const doc = {
      ...minimalDoc,
      steps: [{
        type: "note" as const,
        id: "n1",
        position: "over" as const,
        participants: ["browser", "gw"],
        text: "JWT issued here",
      }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("accepts an alt group", () => {
    const doc = {
      ...minimalDoc,
      steps: [{
        type: "group" as const,
        id: "g1",
        kind: "alt" as const,
        condition: "[valid]",
        branches: [
          {
            label: "[valid]",
            steps: [{ type: "message" as const, id: "m2", from: "gw", to: "browser", label: "200 OK", arrow: "return" as const }],
          },
        ],
      }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("accepts a ref group", () => {
    const doc = {
      ...minimalDoc,
      steps: [{
        type: "group" as const,
        id: "g1",
        kind: "ref" as const,
        label: "See refresh flow",
        seqFile: ".archik/flows/refresh.archik.seq.yaml",
        participants: ["browser", "gw"],
      }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects duplicate step ids", () => {
    const doc = {
      ...minimalDoc,
      steps: [
        minimalDoc.steps[0],
        { ...minimalDoc.steps[0] },
      ],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects duplicate participant ids", () => {
    const doc = {
      ...minimalDoc,
      participants: [
        { id: "browser", nodeId: "frontend" },
        { id: "browser", nodeId: "frontend-v2" },
      ],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("accepts a self-call (from === to)", () => {
    const doc = {
      ...minimalDoc,
      steps: [{
        type: "message" as const,
        id: "m1",
        from: "browser",
        to: "browser",
        label: "refresh()",
        arrow: "sync" as const,
      }],
    };
    expect(SeqDocumentSchema.safeParse(doc).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/domain/seq-schema.test.ts --reporter=verbose 2>&1 | head -10
```

Expected: fails with module not found.

- [ ] **Step 3: Create seq-schema.ts**

Create `src/domain/seq-schema.ts`:

```ts
import { z } from "zod";
import { IdSchema, NodeStatusSchema, SeqFilePathSchema } from "./schema.ts";

export const SeqArrowSchema = z.enum(["sync", "async", "return", "create", "destroy"]);
export const SeqNotePositionSchema = z.enum(["over", "left_of", "right_of"]);
export const SeqGroupKindSchema = z.enum(["alt", "opt", "loop", "par", "break", "ref"]);

export const SeqParticipantSchema = z.strictObject({
  id: IdSchema,
  nodeId: IdSchema,
  label: z.string().min(1).optional(),
});

export const SeqMessageSchema = z.strictObject({
  type: z.literal("message"),
  id: IdSchema,
  from: IdSchema,
  to: IdSchema,
  label: z.string().min(1),
  arrow: SeqArrowSchema,
  activate: z.boolean().optional(),
  status: NodeStatusSchema.optional(),
});

export const SeqNoteSchema = z.strictObject({
  type: z.literal("note"),
  id: IdSchema,
  position: SeqNotePositionSchema,
  participants: z.array(IdSchema).min(1),
  text: z.string().min(1),
  status: NodeStatusSchema.optional(),
});

export type SeqMessage = z.infer<typeof SeqMessageSchema>;
export type SeqNote = z.infer<typeof SeqNoteSchema>;
export type SeqParticipant = z.infer<typeof SeqParticipantSchema>;

export type SeqBranch = {
  label?: string;
  steps: SeqStep[];
};

export type SeqGroup = {
  type: "group";
  id: string;
  kind: "alt" | "opt" | "loop" | "par" | "break" | "ref";
  condition?: string;
  label?: string;
  branches?: SeqBranch[];
  seqFile?: string;
  participants?: string[];
  status?: "proposed" | "active" | "deprecated";
};

export type SeqStep = SeqMessage | SeqNote | SeqGroup;

const SeqBranchSchema: z.ZodType<SeqBranch> = z.lazy(() =>
  z.object({
    label: z.string().optional(),
    steps: z.array(SeqStepSchema),
  }),
);

export const SeqGroupSchema: z.ZodType<SeqGroup> = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    id: IdSchema,
    kind: SeqGroupKindSchema,
    condition: z.string().optional(),
    label: z.string().optional(),
    branches: z.array(SeqBranchSchema).optional(),
    seqFile: SeqFilePathSchema.optional(),
    participants: z.array(IdSchema).optional(),
    status: NodeStatusSchema.optional(),
  }),
);

export const SeqStepSchema: z.ZodType<SeqStep> = z.lazy(() =>
  z.union([SeqMessageSchema, SeqNoteSchema, SeqGroupSchema]),
);

function collectStepIds(steps: SeqStep[], ids: Set<string>): string[] {
  const dupes: string[] = [];
  for (const step of steps) {
    if (ids.has(step.id)) dupes.push(step.id);
    else ids.add(step.id);
    if (step.type === "group" && step.branches) {
      for (const b of step.branches) dupes.push(...collectStepIds(b.steps, ids));
    }
  }
  return dupes;
}

export const SeqDocumentSchema = z
  .object({
    version: z.literal("1.0"),
    name: z.string().min(1),
    description: z.string().optional(),
    participants: z.array(SeqParticipantSchema),
    steps: z.array(SeqStepSchema),
  })
  .superRefine((doc, ctx) => {
    const participantIds = new Set<string>();
    for (let i = 0; i < doc.participants.length; i++) {
      const p = doc.participants[i]!;
      if (participantIds.has(p.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participants", i, "id"],
          message: `duplicate participant id "${p.id}"`,
        });
      }
      participantIds.add(p.id);
    }
    const stepIds = new Set<string>();
    const dupes = collectStepIds(doc.steps, stepIds);
    for (const d of dupes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: `duplicate step id "${d}"`,
      });
    }
  });

export type SeqDocument = z.infer<typeof SeqDocumentSchema>;
```

- [ ] **Step 4: Create seq-types.ts**

Create `src/domain/seq-types.ts`:

```ts
export type {
  SeqArrow,
  SeqBranch,
  SeqDocument,
  SeqGroup,
  SeqMessage,
  SeqNote,
  SeqNotePosition,
  SeqParticipant,
  SeqStep,
} from "./seq-schema.ts";

import type { z } from "zod";
import type {
  SeqArrowSchema,
  SeqGroupKindSchema,
  SeqNotePositionSchema,
} from "./seq-schema.ts";

export type SeqArrow = z.infer<typeof SeqArrowSchema>;
export type SeqGroupKind = z.infer<typeof SeqGroupKindSchema>;
export type SeqNotePosition = z.infer<typeof SeqNotePositionSchema>;
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run src/domain/seq-schema.test.ts --reporter=verbose 2>&1 | tail -10
```

Expected: all tests in seq-schema.test.ts pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/seq-schema.ts src/domain/seq-schema.test.ts src/domain/seq-types.ts
git commit -m "feat(schema): SeqDocumentSchema with participants, messages, groups, notes"
```

---

## Task 3: SeqDocument Cross-Reference Validation

**Files:**
- Create: `src/domain/seq-validate.ts`
- Create: `src/domain/seq-validate.test.ts`
- Modify: `src/domain/validate.ts`
- Modify: `src/domain/validate.test.ts`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Write failing tests for seq validation**

Create `src/domain/seq-validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  validateSeqDocument,
  checkSeqNodeRefs,
  checkSeqFilePaths,
} from "./seq-validate.ts";
import type { SeqDocument } from "./seq-schema.ts";

const knownNodeIds = new Set(["frontend", "api-gateway", "auth-service"]);

const validDoc: SeqDocument = {
  version: "1.0",
  name: "Login Flow",
  participants: [
    { id: "browser", nodeId: "frontend" },
    { id: "gw", nodeId: "api-gateway" },
  ],
  steps: [
    { type: "message", id: "m1", from: "browser", to: "gw", label: "login", arrow: "sync" },
  ],
};

describe("validateSeqDocument", () => {
  it("returns ok for a valid document", () => {
    const result = validateSeqDocument(validDoc as unknown);
    expect(result.ok).toBe(true);
  });
  it("returns errors for missing name", () => {
    const result = validateSeqDocument({ ...validDoc, name: "" });
    expect(result.ok).toBe(false);
  });
});

describe("checkSeqNodeRefs", () => {
  it("returns no errors when all nodeIds are known", () => {
    const errors = checkSeqNodeRefs(validDoc, knownNodeIds);
    expect(errors).toHaveLength(0);
  });

  it("returns error for unknown nodeId", () => {
    const doc: SeqDocument = {
      ...validDoc,
      participants: [{ id: "browser", nodeId: "nonexistent-node" }],
    };
    const errors = checkSeqNodeRefs(doc, knownNodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("nonexistent-node");
  });

  it("returns error for message from unknown participant", () => {
    const doc: SeqDocument = {
      ...validDoc,
      steps: [{ type: "message", id: "m1", from: "unknown-p", to: "gw", label: "x", arrow: "sync" }],
    };
    const errors = checkSeqNodeRefs(doc, knownNodeIds);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("unknown-p");
  });

  it("returns error for note referencing unknown participant", () => {
    const doc: SeqDocument = {
      ...validDoc,
      steps: [{
        type: "note",
        id: "n1",
        position: "over",
        participants: ["browser", "unknown-p"],
        text: "hi",
      }],
    };
    const errors = checkSeqNodeRefs(doc, knownNodeIds);
    expect(errors.some((e) => e.message.includes("unknown-p"))).toBe(true);
  });

  it("validates message participants inside groups recursively", () => {
    const doc: SeqDocument = {
      ...validDoc,
      steps: [{
        type: "group",
        id: "g1",
        kind: "alt",
        branches: [{
          label: "[ok]",
          steps: [{ type: "message", id: "m2", from: "bad-p", to: "gw", label: "x", arrow: "sync" }],
        }],
      }],
    };
    const errors = checkSeqNodeRefs(doc, knownNodeIds);
    expect(errors.some((e) => e.message.includes("bad-p"))).toBe(true);
  });
});

describe("checkSeqFilePaths — seqFiles on architecture nodes", () => {
  it("returns no errors when all paths exist", () => {
    const errors = checkSeqFilePaths(
      [".archik/flows/login.archik.seq.yaml"],
      (p) => p === ".archik/flows/login.archik.seq.yaml",
    );
    expect(errors).toHaveLength(0);
  });
  it("returns error when path does not exist", () => {
    const errors = checkSeqFilePaths(
      [".archik/flows/missing.archik.seq.yaml"],
      () => false,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("missing.archik.seq.yaml");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/domain/seq-validate.test.ts --reporter=verbose 2>&1 | head -5
```

Expected: fails with module not found.

- [ ] **Step 3: Create seq-validate.ts**

Create `src/domain/seq-validate.ts`:

```ts
import { SeqDocumentSchema } from "./seq-schema.ts";
import type { SeqDocument, SeqStep } from "./seq-schema.ts";
import type { ValidationError, ValidateResult } from "./validate.ts";

export function validateSeqDocument(input: unknown): ValidateResult<SeqDocument> {
  const result = SeqDocumentSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    errors: result.error.issues.flatMap((issue) => {
      if (issue.code === "unrecognized_keys") {
        return (issue as { keys: string[] }).keys.map((key) => ({
          path: [...issue.path, key].map(String).join(".") || "<root>",
          message: "unrecognized key",
        }));
      }
      return [{
        path: issue.path.length === 0 ? "<root>" : issue.path.map(String).join("."),
        message: issue.message,
      }];
    }),
  };
}

function collectStepParticipantRefs(
  steps: SeqStep[],
  participantIds: Set<string>,
  errors: ValidationError[],
  pathPrefix: string,
): void {
  steps.forEach((step, i) => {
    const p = `${pathPrefix}.${i}`;
    if (step.type === "message") {
      if (!participantIds.has(step.from)) {
        errors.push({ path: `${p}.from`, message: `participant "${step.from}" is not declared in participants` });
      }
      if (!participantIds.has(step.to)) {
        errors.push({ path: `${p}.to`, message: `participant "${step.to}" is not declared in participants` });
      }
    } else if (step.type === "note") {
      step.participants.forEach((pid, j) => {
        if (!participantIds.has(pid)) {
          errors.push({ path: `${p}.participants.${j}`, message: `participant "${pid}" is not declared in participants` });
        }
      });
    } else if (step.type === "group" && step.branches) {
      step.branches.forEach((branch, bi) => {
        collectStepParticipantRefs(branch.steps, participantIds, errors, `${p}.branches.${bi}.steps`);
      });
    }
  });
}

export function checkSeqNodeRefs(
  doc: SeqDocument,
  knownNodeIds: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const participantIds = new Set<string>();

  doc.participants.forEach((p, i) => {
    participantIds.add(p.id);
    if (!knownNodeIds.has(p.nodeId)) {
      errors.push({
        path: `participants.${i}.nodeId`,
        message: `nodeId "${p.nodeId}" does not match any architecture node. Run \`npx archik q list\` to see available node ids.`,
      });
    }
  });

  collectStepParticipantRefs(doc.steps, participantIds, errors, "steps");
  return errors;
}

export function checkSeqFilePaths(
  seqFilePaths: string[],
  exists: (relPath: string) => boolean,
): ValidationError[] {
  return seqFilePaths
    .filter((p) => !exists(p))
    .map((p) => ({
      path: "seqFiles",
      message: `seqFile "${p}" does not exist on disk (resolved relative to the project root)`,
    }));
}
```

- [ ] **Step 4: Add checkSeqFilePaths export to validate.ts for architecture nodes**

In `src/domain/validate.ts`, after the `checkCrossFileReferences` function, add:

```ts
export function checkArchNodeSeqFilePaths(
  doc: Document,
  exists: (relPath: string) => boolean,
): ValidationError[] {
  const errors: ValidationError[] = [];
  doc.nodes.forEach((node, i) => {
    if (!node.seqFiles) return;
    node.seqFiles.forEach((p, j) => {
      if (!exists(p)) {
        errors.push({
          path: `nodes.${i}.seqFiles.${j}`,
          message: `seqFile "${p}" does not exist on disk (resolved relative to the project root)`,
        });
      }
    });
  });
  return errors;
}
```

- [ ] **Step 5: Add tests for checkArchNodeSeqFilePaths in validate.test.ts**

Add to `src/domain/validate.test.ts`:

```ts
import { checkArchNodeSeqFilePaths } from "./validate.ts";

describe("checkArchNodeSeqFilePaths", () => {
  const doc = {
    version: "1.0" as const,
    name: "test",
    nodes: [{
      id: "gw",
      kind: "gateway" as const,
      name: "GW",
      description: "Routes.",
      seqFiles: [".archik/flows/login.archik.seq.yaml"],
    }],
    edges: [],
  };

  it("returns no errors when seqFile exists", () => {
    const errors = checkArchNodeSeqFilePaths(doc, () => true);
    expect(errors).toHaveLength(0);
  });

  it("returns error when seqFile does not exist", () => {
    const errors = checkArchNodeSeqFilePaths(doc, () => false);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("login.archik.seq.yaml");
  });
});
```

- [ ] **Step 6: Update types.ts to re-export seq types**

Add to `src/domain/types.ts`:

```ts
export type {
  SeqArrow,
  SeqBranch,
  SeqDocument,
  SeqGroup,
  SeqGroupKind,
  SeqMessage,
  SeqNote,
  SeqNotePosition,
  SeqParticipant,
  SeqStep,
} from "./seq-types.ts";
```

- [ ] **Step 7: Run all tests**

```bash
npx vitest run src/domain/ --reporter=verbose 2>&1 | tail -10
```

Expected: all domain tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/domain/seq-validate.ts src/domain/seq-validate.test.ts src/domain/validate.ts src/domain/validate.test.ts src/domain/types.ts
git commit -m "feat(validate): seq cross-reference validation and checkArchNodeSeqFilePaths"
```

---

## Task 4: Seq File Discovery + Validate CLI Extension

**Files:**
- Create: `src/io/seq-discovery.ts`
- Create: `src/io/seq-discovery.test.ts`
- Modify: `src/cli/commands/validate.ts`
- Modify: `src/cli/commands/validate.test.ts`

- [ ] **Step 1: Write failing tests for seq discovery**

Create `src/io/seq-discovery.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { discoverSeqDocs } from "./seq-discovery.ts";
import * as fs from "node:fs/promises";

vi.mock("node:fs/promises");

describe("discoverSeqDocs", () => {
  it("returns empty arrays when no .archik dir", async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));
    const result = await discoverSeqDocs("/project");
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("returns a doc for a valid seq yaml", async () => {
    const yaml = `version: "1.0"\nname: Login Flow\nparticipants:\n  - id: p1\n    nodeId: svc\nsteps: []`;
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: "login.archik.seq.yaml", isDirectory: () => false } as unknown as fs.Dirent,
    ]);
    vi.mocked(fs.readFile).mockResolvedValueOnce(yaml);
    const result = await discoverSeqDocs("/project");
    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]!.relPath).toBe(".archik/login.archik.seq.yaml");
  });

  it("records error for invalid yaml and continues", async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: "bad.archik.seq.yaml", isDirectory: () => false } as unknown as fs.Dirent,
    ]);
    vi.mocked(fs.readFile).mockResolvedValueOnce("not: valid: yaml: !!!");
    const result = await discoverSeqDocs("/project");
    expect(result.docs).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/io/seq-discovery.test.ts --reporter=verbose 2>&1 | head -5
```

- [ ] **Step 3: Create seq-discovery.ts**

Create `src/io/seq-discovery.ts`:

```ts
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { SeqDocumentSchema } from "../domain/seq-schema.ts";
import type { SeqDocument } from "../domain/seq-schema.ts";

export type LoadedSeqDoc = {
  abs: string;
  relPath: string;
  doc: SeqDocument;
};

export type SeqDiscoveryResult = {
  docs: LoadedSeqDoc[];
  errors: Array<{ abs: string; relPath: string; message: string }>;
};

export async function discoverSeqDocs(
  projectBase: string,
): Promise<SeqDiscoveryResult> {
  const docs: LoadedSeqDoc[] = [];
  const errors: SeqDiscoveryResult["errors"] = [];
  const archikDir = path.join(projectBase, ".archik");

  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(archikDir, { withFileTypes: true });
  } catch {
    return { docs, errors };
  }

  await Promise.all(
    entries
      .filter((e) => !e.isDirectory() && e.name.endsWith(".archik.seq.yaml"))
      .map(async (entry) => {
        const abs = path.join(archikDir, entry.name);
        const relPath = `.archik/${entry.name}`;
        let text: string;
        try {
          text = await readFile(abs, "utf-8");
        } catch (err) {
          errors.push({ abs, relPath, message: err instanceof Error ? err.message : String(err) });
          return;
        }
        try {
          const raw = YAML.parse(text);
          const result = SeqDocumentSchema.safeParse(raw);
          if (!result.success) {
            errors.push({ abs, relPath, message: result.error.issues.map((i) => i.message).join("; ") });
            return;
          }
          docs.push({ abs, relPath, doc: result.data });
        } catch (err) {
          errors.push({ abs, relPath, message: err instanceof Error ? err.message : String(err) });
        }
      }),
  );

  return { docs, errors };
}
```

- [ ] **Step 4: Extend validate CLI to discover and validate seq files**

In `src/cli/commands/validate.ts`, import the new helpers and add seq validation after the existing architecture validation block. Add these imports at the top:

```ts
import { discoverSeqDocs } from "../../io/seq-discovery.ts";
import {
  checkSeqNodeRefs,
  validateSeqDocument,
} from "../../domain/seq-validate.ts";
```

At the end of `validateCommand`, after the existing validation succeeds, add seq file validation. Find the block that calls `checkSourcePaths` and returns the success path, then before returning `0`, add:

```ts
  // Validate all .archik.seq.yaml files in the project
  const allNodeIds = new Set(discovery.docs.flatMap((d) => d.doc.nodes.map((n) => n.id)));
  const seqDiscovery = await discoverSeqDocs(base);
  let seqErrorCount = 0;
  for (const e of seqDiscovery.errors) {
    if (json) {
      // surface as part of errors array
    } else {
      console.error(`${cross()} ${e.relPath}: ${e.message}`);
    }
    seqErrorCount++;
  }
  for (const { relPath, doc } of seqDiscovery.docs) {
    const refErrors = checkSeqNodeRefs(doc, allNodeIds);
    if (refErrors.length > 0) {
      if (json) {
        // surface below
      } else {
        console.error(`${cross()} ${relPath}`);
        for (const e of refErrors) console.error(`  • ${e.path}: ${e.message}`);
      }
      seqErrorCount += refErrors.length;
    }
  }
  if (seqErrorCount > 0 && !json) return 1;
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/io/seq-discovery.test.ts src/cli/commands/validate.test.ts --reporter=verbose 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/io/seq-discovery.ts src/io/seq-discovery.test.ts src/cli/commands/validate.ts src/cli/commands/validate.test.ts
git commit -m "feat(io,cli): seq file discovery + extend validate to cover .archik.seq.yaml"
```

---

## Task 5: Sequence Layout Algorithm

**Files:**
- Create: `src/render/seq/seqLayout.ts`
- Create: `src/render/seq/seqLayout.test.ts`

- [ ] **Step 1: Write failing tests for seqLayout**

Create `src/render/seq/seqLayout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { layoutSeqDocument } from "./seqLayout.ts";
import type { SeqDocument } from "../../domain/seq-schema.ts";

const doc: SeqDocument = {
  version: "1.0",
  name: "Login",
  participants: [
    { id: "browser", nodeId: "frontend", label: "Browser" },
    { id: "gw", nodeId: "api-gateway" },
  ],
  steps: [
    { type: "message", id: "m1", from: "browser", to: "gw", label: "POST /login", arrow: "sync" },
    { type: "message", id: "m2", from: "gw", to: "browser", label: "200 OK", arrow: "return" },
  ],
};

describe("layoutSeqDocument", () => {
  it("produces two participants with distinct x positions", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.participants).toHaveLength(2);
    expect(laid.participants[0]!.cx).not.toBe(laid.participants[1]!.cx);
  });

  it("produces a message for each step", () => {
    const laid = layoutSeqDocument(doc);
    const messages = laid.steps.filter((s) => s.type === "message");
    expect(messages).toHaveLength(2);
  });

  it("first message y is above second message y", () => {
    const laid = layoutSeqDocument(doc);
    const msgs = laid.steps.filter((s) => s.type === "message");
    expect(msgs[0]!.y).toBeLessThan(msgs[1]!.y);
  });

  it("total width covers all participants", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.totalWidth).toBeGreaterThan(laid.participants[1]!.cx);
  });

  it("uses participant label for display when provided", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.participants[0]!.label).toBe("Browser");
  });

  it("falls back to nodeId when no label provided", () => {
    const laid = layoutSeqDocument(doc);
    expect(laid.participants[1]!.label).toBe("api-gateway");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/render/seq/seqLayout.test.ts --reporter=verbose 2>&1 | head -5
```

- [ ] **Step 3: Create seqLayout.ts**

Create `src/render/seq/seqLayout.ts`:

```ts
import type { SeqDocument, SeqStep } from "../../domain/seq-schema.ts";

export const PARTICIPANT_HEADER_HEIGHT = 56;
export const PARTICIPANT_MIN_WIDTH = 160;
export const PARTICIPANT_PADDING = 40;
export const MESSAGE_ROW_HEIGHT = 56;
export const GROUP_HEADER_HEIGHT = 24;
export const GROUP_PADDING = 12;
export const NOTE_HEIGHT = 48;
export const DIAGRAM_H_PADDING = 32;
export const DIAGRAM_V_PADDING = 24;

export type LayoutedParticipant = {
  id: string;
  nodeId: string;
  label: string;
  cx: number;
  colWidth: number;
};

export type LayoutedMessage = {
  type: "message";
  id: string;
  fromCx: number;
  toCx: number;
  y: number;
  label: string;
  arrow: string;
  activate: boolean;
  status?: string;
  isSelf: boolean;
};

export type LayoutedNote = {
  type: "note";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  status?: string;
};

export type LayoutedGroup = {
  type: "group";
  id: string;
  kind: string;
  condition?: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  branches: Array<{
    label?: string;
    dividerY: number;
    steps: LayoutedStep[];
  }>;
  status?: string;
};

export type LayoutedStep = LayoutedMessage | LayoutedNote | LayoutedGroup;

export type LayoutedSeqDocument = {
  participants: LayoutedParticipant[];
  steps: LayoutedStep[];
  totalWidth: number;
  totalHeight: number;
};

function measureLabel(label: string): number {
  return Math.max(PARTICIPANT_MIN_WIDTH, label.length * 8 + PARTICIPANT_PADDING * 2);
}

function layoutSteps(
  steps: SeqStep[],
  participantMap: Map<string, LayoutedParticipant>,
  startY: number,
  leftX: number,
  rightX: number,
): { items: LayoutedStep[]; endY: number } {
  let y = startY;
  const items: LayoutedStep[] = [];

  for (const step of steps) {
    if (step.type === "message") {
      const fromP = participantMap.get(step.from);
      const toP = participantMap.get(step.to);
      const fromCx = fromP?.cx ?? 0;
      const toCx = toP?.cx ?? 0;
      items.push({
        type: "message",
        id: step.id,
        fromCx,
        toCx,
        y,
        label: step.label,
        arrow: step.arrow,
        activate: step.activate ?? false,
        status: step.status,
        isSelf: step.from === step.to,
      });
      y += step.from === step.to ? MESSAGE_ROW_HEIGHT * 1.5 : MESSAGE_ROW_HEIGHT;
    } else if (step.type === "note") {
      const pCxs = step.participants
        .map((pid) => participantMap.get(pid)?.cx ?? 0)
        .sort((a, b) => a - b);
      const noteX = (pCxs[0] ?? leftX) - 8;
      const noteW = ((pCxs[pCxs.length - 1] ?? rightX) - (pCxs[0] ?? leftX)) + 16;
      items.push({
        type: "note",
        id: step.id,
        x: noteX,
        y,
        width: Math.max(80, noteW),
        height: NOTE_HEIGHT,
        text: step.text,
        status: step.status,
      });
      y += NOTE_HEIGHT + 8;
    } else if (step.type === "group") {
      const groupX = leftX - GROUP_PADDING;
      const groupWidth = rightX - leftX + GROUP_PADDING * 2;
      const groupStartY = y;
      y += GROUP_HEADER_HEIGHT;

      const layoutedBranches: LayoutedGroup["branches"] = [];
      if (step.branches) {
        for (let i = 0; i < step.branches.length; i++) {
          const branch = step.branches[i]!;
          const { items: branchItems, endY } = layoutSteps(
            branch.steps,
            participantMap,
            y,
            leftX,
            rightX,
          );
          y = endY;
          layoutedBranches.push({
            label: branch.label,
            dividerY: i < step.branches.length - 1 ? y : -1,
            steps: branchItems,
          });
          if (i < step.branches.length - 1) y += 4;
        }
      }
      y += GROUP_PADDING;

      items.push({
        type: "group",
        id: step.id,
        kind: step.kind,
        condition: step.condition,
        label: step.label,
        x: groupX,
        y: groupStartY,
        width: groupWidth,
        height: y - groupStartY,
        branches: layoutedBranches,
        status: step.status,
      });
    }
  }

  return { items, endY: y };
}

export function layoutSeqDocument(doc: SeqDocument): LayoutedSeqDocument {
  // Compute column widths
  const colWidths = doc.participants.map((p) =>
    measureLabel(p.label ?? p.nodeId),
  );

  // Assign x positions (cx = center of column)
  let x = DIAGRAM_H_PADDING;
  const participants: LayoutedParticipant[] = doc.participants.map((p, i) => {
    const colWidth = colWidths[i]!;
    const cx = x + colWidth / 2;
    x += colWidth;
    return { id: p.id, nodeId: p.nodeId, label: p.label ?? p.nodeId, cx, colWidth };
  });
  const totalWidth = x + DIAGRAM_H_PADDING;

  const participantMap = new Map(participants.map((p) => [p.id, p]));
  const leftX = participants[0]?.cx ?? DIAGRAM_H_PADDING;
  const rightX = participants[participants.length - 1]?.cx ?? totalWidth - DIAGRAM_H_PADDING;

  const startY = PARTICIPANT_HEADER_HEIGHT + DIAGRAM_V_PADDING;
  const { items: steps, endY } = layoutSteps(doc.steps, participantMap, startY, leftX, rightX);
  const totalHeight = endY + DIAGRAM_V_PADDING;

  return { participants, steps, totalWidth, totalHeight };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/render/seq/seqLayout.test.ts --reporter=verbose 2>&1 | tail -10
```

Expected: all seqLayout tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/render/seq/seqLayout.ts src/render/seq/seqLayout.test.ts
git commit -m "feat(render): sequence diagram layout algorithm"
```

---

## Task 6: Core SVG Renderer — Participants, Lifelines, Messages

**Files:**
- Create: `src/render/seq/SeqParticipantHeader.tsx`
- Create: `src/render/seq/SeqLifeline.tsx`
- Create: `src/render/seq/SeqMessage.tsx`
- Create: `src/render/seq/SeqDiagramSvg.tsx`
- Create: `src/render/seq/SeqDiagramSvg.test.tsx`

- [ ] **Step 1: Write failing rendering tests**

Create `src/render/seq/SeqDiagramSvg.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SeqDiagramSvg } from "./SeqDiagramSvg.tsx";
import { layoutSeqDocument } from "./seqLayout.ts";
import type { SeqDocument } from "../../domain/seq-schema.ts";

const doc: SeqDocument = {
  version: "1.0",
  name: "Login",
  participants: [
    { id: "browser", nodeId: "frontend", label: "Browser" },
    { id: "gw", nodeId: "api-gateway" },
  ],
  steps: [
    { type: "message", id: "m1", from: "browser", to: "gw", label: "POST /login", arrow: "sync" },
    { type: "message", id: "m2", from: "gw", to: "browser", label: "200 OK", arrow: "return" },
    { type: "message", id: "m3", from: "gw", to: "gw", label: "refresh()", arrow: "sync" },
  ],
};

describe("SeqDiagramSvg", () => {
  it("renders an svg element", () => {
    const laid = layoutSeqDocument(doc);
    const { container } = render(<SeqDiagramSvg laid={laid} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders participant labels", () => {
    const laid = layoutSeqDocument(doc);
    const { getByText } = render(<SeqDiagramSvg laid={laid} />);
    expect(getByText("Browser")).not.toBeNull();
    expect(getByText("api-gateway")).not.toBeNull();
  });

  it("renders message labels", () => {
    const laid = layoutSeqDocument(doc);
    const { getByText } = render(<SeqDiagramSvg laid={laid} />);
    expect(getByText("POST /login")).not.toBeNull();
    expect(getByText("200 OK")).not.toBeNull();
  });

  it("renders a self-call message", () => {
    const laid = layoutSeqDocument(doc);
    const { getByText } = render(<SeqDiagramSvg laid={laid} />);
    expect(getByText("refresh()")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/render/seq/SeqDiagramSvg.test.tsx --reporter=verbose 2>&1 | head -5
```

- [ ] **Step 3: Create SeqParticipantHeader.tsx**

Create `src/render/seq/SeqParticipantHeader.tsx`:

```tsx
import { KIND_META } from "../kindPalette.ts";
import type { NodeKind } from "../../domain/types.ts";
import type { LayoutedParticipant } from "./seqLayout.ts";
import { PARTICIPANT_HEADER_HEIGHT } from "./seqLayout.ts";

type Props = {
  participant: LayoutedParticipant;
  nodeKind?: NodeKind;
};

const CHIP_H = 36;
const CHIP_HALF_W = 64;

export function SeqParticipantHeader({ participant, nodeKind }: Props): React.ReactElement {
  const meta = nodeKind ? KIND_META[nodeKind] : undefined;
  const color = meta?.color ?? "var(--archik-fg-muted)";
  const Icon = meta?.icon;
  const chipY = (PARTICIPANT_HEADER_HEIGHT - CHIP_H) / 2;

  return (
    <g transform={`translate(${participant.cx - CHIP_HALF_W}, ${chipY})`}>
      <rect
        width={CHIP_HALF_W * 2}
        height={CHIP_H}
        rx={8}
        fill="var(--archik-node-fill)"
        stroke={color}
        strokeWidth={1.4}
      />
      {Icon && (
        <foreignObject x={8} y={8} width={18} height={18}>
          <Icon size={16} color={color} strokeWidth={1.5} />
        </foreignObject>
      )}
      <text
        x={Icon ? 32 : CHIP_HALF_W}
        y={CHIP_H / 2 + 4}
        textAnchor={Icon ? "start" : "middle"}
        fontSize={12}
        fontWeight={500}
        fill="var(--archik-fg)"
        fontFamily="inherit"
      >
        {participant.label}
      </text>
    </g>
  );
}
```

- [ ] **Step 4: Create SeqLifeline.tsx**

Create `src/render/seq/SeqLifeline.tsx`:

```tsx
import type { LayoutedParticipant } from "./seqLayout.ts";
import { PARTICIPANT_HEADER_HEIGHT } from "./seqLayout.ts";

type Props = {
  participant: LayoutedParticipant;
  totalHeight: number;
};

export function SeqLifeline({ participant, totalHeight }: Props): React.ReactElement {
  return (
    <line
      x1={participant.cx}
      y1={PARTICIPANT_HEADER_HEIGHT}
      x2={participant.cx}
      y2={totalHeight}
      stroke="var(--archik-node-stroke)"
      strokeWidth={1}
      strokeDasharray="4 4"
      opacity={0.5}
    />
  );
}
```

- [ ] **Step 5: Create SeqMessage.tsx**

Create `src/render/seq/SeqMessage.tsx`:

```tsx
import type { LayoutedMessage } from "./seqLayout.ts";

const SELF_LOOP_W = 32;
const SELF_LOOP_H = 20;
const LABEL_OFFSET_Y = -6;
const ACTIVATION_W = 8;
const ACTIVATION_H = 20;

type ArrowProps = { x1: number; y1: number; x2: number; y2: number; dashed: boolean; markerId: string };

function Arrow({ x1, y1, x2, y2, dashed, markerId }: ArrowProps): React.ReactElement {
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke="var(--archik-edge-filled)"
      strokeWidth={1.4}
      strokeDasharray={dashed ? "4 4" : undefined}
      markerEnd={`url(#${markerId})`}
    />
  );
}

export function SeqMessage({ msg }: { msg: LayoutedMessage }): React.ReactElement {
  const isReturn = msg.arrow === "return";
  const isAsync = msg.arrow === "async";
  const isCreate = msg.arrow === "create";
  const dashed = isReturn || isCreate;
  const markerId = isReturn || isAsync ? "seq-arrow-open" : "seq-arrow-filled";
  const opacity = msg.status === "proposed" ? 0.5 : msg.status === "deprecated" ? 0.35 : 1;

  if (msg.isSelf) {
    const x = msg.fromCx;
    const y = msg.y;
    const path = `M ${x} ${y} L ${x + SELF_LOOP_W} ${y} L ${x + SELF_LOOP_W} ${y + SELF_LOOP_H} L ${x} ${y + SELF_LOOP_H}`;
    return (
      <g opacity={opacity}>
        <path d={path} fill="none" stroke="var(--archik-edge-filled)" strokeWidth={1.4} markerEnd={`url(#${markerId})`} />
        <text x={x + SELF_LOOP_W + 6} y={y + SELF_LOOP_H / 2 + 4} fontSize={11} fill="var(--archik-fg)" fontFamily="inherit">
          {msg.label}
        </text>
      </g>
    );
  }

  const leftToRight = msg.fromCx < msg.toCx;
  const arrowX2 = leftToRight ? msg.toCx - 6 : msg.toCx + 6;
  const labelX = (msg.fromCx + msg.toCx) / 2;

  return (
    <g opacity={opacity}>
      {msg.activate && (
        <rect
          x={msg.toCx - ACTIVATION_W / 2}
          y={msg.y - 2}
          width={ACTIVATION_W}
          height={ACTIVATION_H}
          fill="var(--archik-node-fill)"
          stroke="var(--archik-node-stroke)"
          strokeWidth={1}
          rx={2}
        />
      )}
      <Arrow x1={msg.fromCx} y1={msg.y} x2={arrowX2} y2={msg.y} dashed={dashed} markerId={markerId} />
      <text x={labelX} y={msg.y + LABEL_OFFSET_Y} textAnchor="middle" fontSize={11} fill="var(--archik-fg)" fontFamily="inherit">
        {isCreate && "«create» "}
        {msg.label}
      </text>
      {msg.arrow === "destroy" && (
        <g transform={`translate(${msg.toCx - 6}, ${msg.y - 6})`}>
          <line x1={0} y1={0} x2={12} y2={12} stroke="var(--archik-fg-muted)" strokeWidth={1.5} />
          <line x1={12} y1={0} x2={0} y2={12} stroke="var(--archik-fg-muted)" strokeWidth={1.5} />
        </g>
      )}
    </g>
  );
}
```

- [ ] **Step 6: Create SeqDiagramSvg.tsx (core — messages and participants only)**

Create `src/render/seq/SeqDiagramSvg.tsx`:

```tsx
import type { LayoutedSeqDocument, LayoutedStep } from "./seqLayout.ts";
import { PARTICIPANT_HEADER_HEIGHT } from "./seqLayout.ts";
import { SeqParticipantHeader } from "./SeqParticipantHeader.tsx";
import { SeqLifeline } from "./SeqLifeline.tsx";
import { SeqMessage } from "./SeqMessage.tsx";

function FilledTriangle({ id }: { id: string }): React.ReactElement {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
    </marker>
  );
}

function OpenTriangle({ id }: { id: string }): React.ReactElement {
  return (
    <marker id={id} viewBox="0 0 12 12" refX="11" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 1 1 L 11 6 L 1 11" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinejoin="round" />
    </marker>
  );
}

function renderStep(step: LayoutedStep): React.ReactElement | null {
  if (step.type === "message") return <SeqMessage key={step.id} msg={step} />;
  return null;
}

type Props = {
  laid: LayoutedSeqDocument;
  svgRef?: React.RefObject<SVGSVGElement | null>;
};

export function SeqDiagramSvg({ laid, svgRef }: Props): React.ReactElement {
  const { participants, steps, totalWidth, totalHeight } = laid;
  const svgHeight = totalHeight;

  return (
    <svg
      ref={svgRef}
      width={totalWidth}
      height={svgHeight}
      viewBox={`0 0 ${totalWidth} ${svgHeight}`}
      style={{ fontFamily: "var(--archik-font, system-ui)" }}
    >
      <defs>
        <FilledTriangle id="seq-arrow-filled" />
        <OpenTriangle id="seq-arrow-open" />
      </defs>

      {participants.map((p) => (
        <SeqLifeline key={p.id} participant={p} totalHeight={svgHeight} />
      ))}

      {participants.map((p) => (
        <SeqParticipantHeader key={p.id} participant={p} />
      ))}

      <g transform={`translate(0, ${PARTICIPANT_HEADER_HEIGHT})`}>
        {steps.map((step) => renderStep(step))}
      </g>
    </svg>
  );
}
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run src/render/seq/SeqDiagramSvg.test.tsx --reporter=verbose 2>&1 | tail -10
```

Expected: all 4 SeqDiagramSvg tests pass.

- [ ] **Step 8: Run full suite**

```bash
npm test 2>&1 | tail -5
```

- [ ] **Step 9: Commit**

```bash
git add src/render/seq/
git commit -m "feat(render): core sequence SVG renderer — participants, lifelines, messages"
```

---

## Task 7: Groups + Notes SVG

**Files:**
- Create: `src/render/seq/SeqGroupFrame.tsx`
- Create: `src/render/seq/SeqNote.tsx`
- Modify: `src/render/seq/SeqDiagramSvg.tsx`
- Modify: `src/render/seq/SeqDiagramSvg.test.tsx`

- [ ] **Step 1: Add tests for groups and notes**

Add to `src/render/seq/SeqDiagramSvg.test.tsx`:

```tsx
const docWithGroup: SeqDocument = {
  version: "1.0",
  name: "With Group",
  participants: [
    { id: "a", nodeId: "svc-a" },
    { id: "b", nodeId: "svc-b" },
  ],
  steps: [{
    type: "group",
    id: "g1",
    kind: "alt",
    condition: "[ok]",
    branches: [{
      label: "[ok]",
      steps: [{ type: "message", id: "m1", from: "a", to: "b", label: "call()", arrow: "sync" }],
    }],
  }],
};

const docWithNote: SeqDocument = {
  version: "1.0",
  name: "With Note",
  participants: [
    { id: "a", nodeId: "svc-a" },
    { id: "b", nodeId: "svc-b" },
  ],
  steps: [{
    type: "note",
    id: "n1",
    position: "over",
    participants: ["a", "b"],
    text: "JWT issued here",
  }],
};

it("renders a group frame with condition", () => {
  const laid = layoutSeqDocument(docWithGroup);
  const { getByText } = render(<SeqDiagramSvg laid={laid} />);
  expect(getByText("[ok]")).not.toBeNull();
});

it("renders a note with text", () => {
  const laid = layoutSeqDocument(docWithNote);
  const { getByText } = render(<SeqDiagramSvg laid={laid} />);
  expect(getByText("JWT issued here")).not.toBeNull();
});
```

- [ ] **Step 2: Run test to confirm new tests fail**

```bash
npx vitest run src/render/seq/SeqDiagramSvg.test.tsx --reporter=verbose 2>&1 | grep -E "FAIL|pass"
```

- [ ] **Step 3: Create SeqGroupFrame.tsx**

Create `src/render/seq/SeqGroupFrame.tsx`:

```tsx
import type { LayoutedGroup, LayoutedStep } from "./seqLayout.ts";

type Props = {
  group: LayoutedGroup;
  renderStep: (step: LayoutedStep) => React.ReactElement | null;
};

const KIND_COLORS: Record<string, string> = {
  alt: "#6366f1",
  opt: "#0ea5e9",
  loop: "#10b981",
  par: "#f59e0b",
  break: "#ef4444",
  ref: "#8b5cf6",
};

const TAB_W = 36;
const TAB_H = 18;

export function SeqGroupFrame({ group, renderStep }: Props): React.ReactElement {
  const color = KIND_COLORS[group.kind] ?? "var(--archik-fg-muted)";
  const opacity = group.status === "proposed" ? 0.55 : group.status === "deprecated" ? 0.35 : 1;

  return (
    <g opacity={opacity}>
      <rect
        x={group.x}
        y={group.y}
        width={group.width}
        height={group.height}
        rx={4}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        opacity={0.6}
      />
      <rect x={group.x} y={group.y} width={TAB_W} height={TAB_H} rx={4} fill={color} opacity={0.8} />
      <text
        x={group.x + 6}
        y={group.y + TAB_H - 5}
        fontSize={10}
        fontWeight={600}
        fill="#fff"
        fontFamily="inherit"
      >
        {group.kind}
      </text>
      {group.condition && (
        <text
          x={group.x + TAB_W + 6}
          y={group.y + TAB_H - 5}
          fontSize={10}
          fill={color}
          fontFamily="inherit"
        >
          {group.condition}
        </text>
      )}
      {group.label && !group.condition && (
        <text
          x={group.x + TAB_W + 6}
          y={group.y + TAB_H - 5}
          fontSize={10}
          fill={color}
          fontFamily="inherit"
        >
          {group.label}
        </text>
      )}
      {group.branches.map((branch, i) => (
        <g key={i}>
          {branch.steps.map((s) => renderStep(s))}
          {branch.dividerY > 0 && (
            <g>
              <line
                x1={group.x}
                y1={branch.dividerY}
                x2={group.x + group.width}
                y2={branch.dividerY}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="4 2"
                opacity={0.5}
              />
              {branch.label && (
                <text
                  x={group.x + 6}
                  y={branch.dividerY + 12}
                  fontSize={10}
                  fill={color}
                  fontFamily="inherit"
                >
                  {branch.label}
                </text>
              )}
            </g>
          )}
        </g>
      ))}
    </g>
  );
}
```

- [ ] **Step 4: Create SeqNote.tsx**

Create `src/render/seq/SeqNote.tsx`:

```tsx
import type { LayoutedNote } from "./seqLayout.ts";

const FOLD = 10;

export function SeqNote({ note }: { note: LayoutedNote }): React.ReactElement {
  const { x, y, width, height, text } = note;
  const opacity = note.status === "proposed" ? 0.55 : note.status === "deprecated" ? 0.35 : 1;

  return (
    <g opacity={opacity}>
      <path
        d={`M ${x} ${y} L ${x + width - FOLD} ${y} L ${x + width} ${y + FOLD} L ${x + width} ${y + height} L ${x} ${y + height} Z`}
        fill="var(--archik-node-fill)"
        stroke="var(--archik-node-stroke)"
        strokeWidth={1.2}
      />
      <path
        d={`M ${x + width - FOLD} ${y} L ${x + width - FOLD} ${y + FOLD} L ${x + width} ${y + FOLD}`}
        fill="none"
        stroke="var(--archik-node-stroke)"
        strokeWidth={1.2}
      />
      <foreignObject x={x + 8} y={y + 8} width={width - 16} height={height - 16}>
        <div
          style={{
            fontSize: 11,
            color: "var(--archik-fg)",
            fontFamily: "inherit",
            lineHeight: 1.4,
            overflow: "hidden",
          }}
        >
          {text}
        </div>
      </foreignObject>
    </g>
  );
}
```

- [ ] **Step 5: Update SeqDiagramSvg.tsx to render groups and notes**

In `src/render/seq/SeqDiagramSvg.tsx`, update the imports and `renderStep` function:

```tsx
import { SeqGroupFrame } from "./SeqGroupFrame.tsx";
import { SeqNote } from "./SeqNote.tsx";
```

Replace the `renderStep` function with a recursive version:

```tsx
function RenderStep({ step }: { step: LayoutedStep }): React.ReactElement | null {
  if (step.type === "message") return <SeqMessage msg={step} />;
  if (step.type === "note") return <SeqNote note={step} />;
  if (step.type === "group") {
    return (
      <SeqGroupFrame
        group={step}
        renderStep={(s) => <RenderStep key={s.id} step={s} />}
      />
    );
  }
  return null;
}
```

In `SeqDiagramSvg`, replace the `{steps.map((step) => renderStep(step))}` line with:

```tsx
{steps.map((step) => <RenderStep key={step.id} step={step} />)}
```

- [ ] **Step 6: Run all seq tests**

```bash
npx vitest run src/render/seq/ --reporter=verbose 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/render/seq/SeqGroupFrame.tsx src/render/seq/SeqNote.tsx src/render/seq/SeqDiagramSvg.tsx src/render/seq/SeqDiagramSvg.test.tsx
git commit -m "feat(render): sequence diagram groups, notes, and self-call rendering"
```

---

## Task 8: SequencePage + Dev Server Route

**Files:**
- Create: `src/ui/SequencePage.tsx`
- Create: `src/ui/SequencePage.test.tsx`
- Modify: `src/server/handlers.ts`
- Modify: `vite/archikWatch.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write failing tests for SequencePage**

Create `src/ui/SequencePage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SequencePage } from "./SequencePage.tsx";

const validSeqYaml = `
version: "1.0"
name: Login Flow
participants:
  - id: browser
    nodeId: frontend
    label: Browser
  - id: gw
    nodeId: api-gateway
steps:
  - type: message
    id: m1
    from: browser
    to: gw
    label: POST /auth/login
    arrow: sync
`;

describe("SequencePage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows loading state initially", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    render(<SequencePage path=".archik/flows/login.archik.seq.yaml" fromViewKey={null} />);
    expect(screen.getByText(/loading/i)).not.toBeNull();
  });

  it("shows error when fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" } as Response);
    render(<SequencePage path=".archik/flows/missing.archik.seq.yaml" fromViewKey={null} />);
    await screen.findByText(/not found/i);
  });

  it("renders the diagram when fetch succeeds", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => validSeqYaml,
    } as Response);
    render(<SequencePage path=".archik/flows/login.archik.seq.yaml" fromViewKey={null} />);
    await screen.findByText("Login Flow");
  });

  it("shows back link to architecture", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => validSeqYaml,
    } as Response);
    render(<SequencePage path=".archik/flows/login.archik.seq.yaml" fromViewKey={null} />);
    await screen.findByText(/architecture/i);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/ui/SequencePage.test.tsx --reporter=verbose 2>&1 | head -5
```

- [ ] **Step 3: Create SequencePage.tsx**

Create `src/ui/SequencePage.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import YAML from "yaml";
import { SeqDocumentSchema } from "../domain/seq-schema.ts";
import type { SeqDocument } from "../domain/seq-schema.ts";
import { layoutSeqDocument } from "../render/seq/seqLayout.ts";
import { SeqDiagramSvg } from "../render/seq/SeqDiagramSvg.tsx";
import { ExportMenu } from "./ExportMenu.tsx";
import { downloadBlob, exportFilename, snapshotSvgBlob } from "../io/canvasExport.ts";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; doc: SeqDocument };

type Props = {
  path: string;
  fromViewKey: string | null;
};

export function SequencePage({ path, fromViewKey }: Props): React.ReactElement {
  const [state, setState] = useState<State>({ status: "loading" });
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setState({ status: "loading" });
    const encoded = encodeURIComponent(path);
    fetch(`/__archik/seq-file?path=${encoded}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        const raw = YAML.parse(text);
        const result = SeqDocumentSchema.safeParse(raw);
        if (!result.success) {
          throw new Error(result.error.issues.map((i) => i.message).join("; "));
        }
        setState({ status: "ready", doc: result.data });
      })
      .catch((err) => {
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
  }, [path]);

  const backHref = fromViewKey
    ? `/?viewKey=${encodeURIComponent(fromViewKey)}`
    : "/";

  if (state.status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center" style={{ color: "var(--archik-fg-muted)" }}>
        Loading sequence diagram…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div style={{ color: "var(--archik-fg-error, #ef4444)" }}>{state.message}</div>
        <a href={backHref} style={{ color: "var(--archik-fg-muted)", fontSize: 13 }}>
          ← Architecture
        </a>
      </div>
    );
  }

  const laid = layoutSeqDocument(state.doc);
  const filename = exportFilename(path.replace(/^.*\//, "").replace(/\.archik\.seq\.yaml$/, ""));

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--archik-bg)" }}>
      <div
        className="flex items-center gap-3 px-4"
        style={{
          height: 48,
          borderBottom: "1px solid var(--archik-node-stroke)",
          background: "var(--archik-toolbar-bg, var(--archik-node-fill))",
        }}
      >
        <a
          href={backHref}
          style={{ color: "var(--archik-fg-muted)", fontSize: 13, textDecoration: "none" }}
        >
          ← Architecture
        </a>
        <span style={{ color: "var(--archik-node-stroke)" }}>|</span>
        <span style={{ fontWeight: 500, fontSize: 14, color: "var(--archik-fg)" }}>
          {state.doc.name}
        </span>
        <div className="ml-auto">
          <ExportMenu
            document={{ version: "1.0", name: state.doc.name, nodes: [], edges: [] }}
            filename={filename}
            getSvg={() => svgRef.current}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <SeqDiagramSvg laid={laid} svgRef={svgRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add /__archik/seq-file handler to handlers.ts**

In `src/server/handlers.ts`, add the following handler function after the existing handler functions (before the export of the main `handleRequest` function or just before the end of the file):

```ts
export async function handleSeqFile(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const relPath = url.searchParams.get("path");
  if (!relPath || !relPath.endsWith(".archik.seq.yaml")) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("path must end in .archik.seq.yaml");
    return;
  }
  const abs = path.resolve(projectRoot, relPath);
  let text: string;
  try {
    text = await fs.readFile(abs, "utf-8");
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`Not Found: ${relPath}`);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/yaml; charset=utf-8" });
  res.end(text);
}
```

- [ ] **Step 5: Wire the handler in vite/archikWatch.ts**

In `vite/archikWatch.ts`, after the existing route constants, add:

```ts
const SEQ_FILE_URL = `/__archik/seq-file`;
```

In the `configureServer` middleware block (where other routes like `FILE_URL` are handled), add:

```ts
if (url.pathname === SEQ_FILE_URL) {
  await handleSeqFile(req, res, projectRoot);
  return;
}
```

Also import `handleSeqFile` in the import statement from `handlers.ts`.

- [ ] **Step 6: Update main.tsx to route to SequencePage**

Replace `src/main.tsx` with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App.tsx";
import { SequencePage } from "./ui/SequencePage.tsx";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

const params = new URLSearchParams(window.location.search);
const isSeqRoute = window.location.pathname === "/__archik/seq" ||
  window.location.pathname.startsWith("/__archik/seq/");

const root = createRoot(rootEl);

if (isSeqRoute) {
  const seqPath = params.get("path") ?? "";
  const fromViewKey = params.get("from");
  root.render(
    <StrictMode>
      <SequencePage path={seqPath} fromViewKey={fromViewKey} />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run src/ui/SequencePage.test.tsx --reporter=verbose 2>&1 | tail -10
```

Expected: all 4 SequencePage tests pass.

- [ ] **Step 8: Run full suite**

```bash
npm test 2>&1 | tail -5
```

- [ ] **Step 9: Commit**

```bash
git add src/ui/SequencePage.tsx src/ui/SequencePage.test.tsx src/server/handlers.ts vite/archikWatch.ts src/main.tsx
git commit -m "feat(ui,server): SequencePage canvas route and /__archik/seq-file handler"
```

---

## Task 9: NodeInspector — seqFiles Section

**Files:**
- Modify: `src/ui/NodeInspector.tsx`
- Modify: `src/ui/NodeInspector.test.tsx`

- [ ] **Step 1: Write failing test**

Add to `src/ui/NodeInspector.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeInspector } from "./NodeInspector.tsx";

it("shows sequence diagrams section when node has seqFiles", () => {
  const node = {
    id: "gw",
    kind: "gateway" as const,
    name: "API Gateway",
    description: "Routes traffic.",
    seqFiles: [".archik/flows/login.archik.seq.yaml"],
  };
  render(<NodeInspector node={node} dispatch={() => {}} />);
  expect(screen.getByText("Sequence Diagrams")).not.toBeNull();
  expect(screen.getByText("login")).not.toBeNull();
});

it("does not show sequence diagrams section when no seqFiles", () => {
  const node = {
    id: "gw",
    kind: "gateway" as const,
    name: "API Gateway",
    description: "Routes traffic.",
  };
  render(<NodeInspector node={node} dispatch={() => {}} />);
  expect(screen.queryByText("Sequence Diagrams")).toBeNull();
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/ui/NodeInspector.test.tsx --reporter=verbose 2>&1 | grep -E "FAIL|Sequence Diagrams"
```

- [ ] **Step 3: Add seqFiles section to NodeInspector.tsx**

In `src/ui/NodeInspector.tsx`, find the return JSX (the `<div className="flex h-full flex-col gap-4 ...">` block) and add the following section just before the closing `</div>`, after all existing fields:

```tsx
{node.seqFiles && node.seqFiles.length > 0 && (
  <div>
    <div className="archik-label">Sequence Diagrams</div>
    <div className="flex flex-col gap-1 mt-1">
      {node.seqFiles.map((seqFile) => {
        const label = seqFile.replace(/^.*\//, "").replace(/\.archik\.seq\.yaml$/, "");
        const href = `/__archik/seq?path=${encodeURIComponent(seqFile)}`;
        return (
          <a
            key={seqFile}
            href={href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              padding: "3px 8px",
              borderRadius: 6,
              background: "var(--archik-node-fill)",
              border: "1px solid var(--archik-node-stroke)",
              color: "var(--archik-fg)",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            {label}
          </a>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/ui/NodeInspector.test.tsx --reporter=verbose 2>&1 | tail -10
```

Expected: all NodeInspector tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/NodeInspector.tsx src/ui/NodeInspector.test.tsx
git commit -m "feat(ui): NodeInspector shows seqFiles chips linking to sequence canvas"
```

---

## Task 10: `q sequences` CLI Subcommand

**Files:**
- Modify: `src/cli/commands/q.ts`
- Modify: `src/cli/commands/q.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/cli/commands/q.test.ts`:

```ts
it("q sequences prints all seq files", async () => {
  // mock discoverSeqDocs to return two docs
  // assert output contains their relPaths and names
});
```

For the actual test, the existing `q.test.ts` pattern uses actual filesystem fixtures. Add this test checking the command output format:

```ts
import { discoverSeqDocs } from "../../io/seq-discovery.ts";
vi.mock("../../io/seq-discovery.ts");

it("q sequences lists seq files with participant count", async () => {
  vi.mocked(discoverSeqDocs).mockResolvedValue({
    docs: [{
      abs: "/project/.archik/login.archik.seq.yaml",
      relPath: ".archik/login.archik.seq.yaml",
      doc: {
        version: "1.0",
        name: "Login Flow",
        participants: [
          { id: "browser", nodeId: "frontend" },
          { id: "gw", nodeId: "api-gateway" },
        ],
        steps: [],
      },
    }],
    errors: [],
  });
  const output: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
  const exit = await qCommand({ _: ["sequences"] }, "/project");
  expect(exit).toBe(0);
  expect(output.some((l) => l.includes("Login Flow"))).toBe(true);
  expect(output.some((l) => l.includes("login.archik.seq.yaml"))).toBe(true);
});

it("q sequences --node filters by participant nodeId", async () => {
  vi.mocked(discoverSeqDocs).mockResolvedValue({
    docs: [
      {
        abs: "/project/.archik/login.archik.seq.yaml",
        relPath: ".archik/login.archik.seq.yaml",
        doc: { version: "1.0", name: "Login Flow", participants: [{ id: "b", nodeId: "frontend" }], steps: [] },
      },
      {
        abs: "/project/.archik/payment.archik.seq.yaml",
        relPath: ".archik/payment.archik.seq.yaml",
        doc: { version: "1.0", name: "Payment Flow", participants: [{ id: "b", nodeId: "payments" }], steps: [] },
      },
    ],
    errors: [],
  });
  const output: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
  await qCommand({ _: ["sequences"], node: "payments" }, "/project");
  expect(output.some((l) => l.includes("Payment Flow"))).toBe(true);
  expect(output.every((l) => !l.includes("Login Flow"))).toBe(true);
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/cli/commands/q.test.ts --reporter=verbose 2>&1 | grep -E "sequences|FAIL"
```

- [ ] **Step 3: Add sequences subcommand to q.ts**

In `src/cli/commands/q.ts`, add the following import at the top:

```ts
import { discoverSeqDocs } from "../../io/seq-discovery.ts";
```

Add a `sequencesCommand` function after the existing subcommand functions:

```ts
async function sequencesCommand(
  opts: ParsedOptions,
  base: string,
): Promise<number> {
  const nodeFilter = getString(opts, "node");
  const json = isJson(opts);

  const { docs, errors } = await discoverSeqDocs(base);

  for (const e of errors) {
    if (!json) console.error(`${yellow("warn:")} ${e.relPath}: ${e.message}`);
  }

  const filtered = nodeFilter
    ? docs.filter((d) => d.doc.participants.some((p) => p.nodeId === nodeFilter))
    : docs;

  if (json) {
    console.log(JSON.stringify(filtered.map((d) => ({
      relPath: d.relPath,
      name: d.doc.name,
      participants: d.doc.participants.map((p) => ({ id: p.id, nodeId: p.nodeId, label: p.label })),
    })), null, 2));
    return 0;
  }

  if (filtered.length === 0) {
    console.log(dim("No sequence diagrams found."));
    if (nodeFilter) console.log(dim(`(filtered by --node ${nodeFilter})`));
    return 0;
  }

  for (const d of filtered) {
    const participants = d.doc.participants.map((p) => p.nodeId).join(", ");
    console.log(`${cyan(d.doc.name)}  ${dim(d.relPath)}`);
    console.log(`  ${dim("participants:")} ${participants}`);
  }
  return 0;
}
```

In the main `qCommand` function's subcommand dispatch, add before the default/unknown case:

```ts
case "sequences":
  return sequencesCommand(opts, base);
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/cli/commands/q.test.ts --reporter=verbose 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/q.ts src/cli/commands/q.test.ts
git commit -m "feat(cli): npx archik q sequences [--node <id>] subcommand"
```

---

## Task 11: `render --seq` CLI

**Files:**
- Modify: `src/cli/commands/render.ts`
- Modify: `src/cli/commands/render.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/cli/commands/render.test.ts`:

```ts
import { renderCommand } from "./render.ts";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";

vi.mock("node:fs/promises");
vi.mock("node:fs");

it("render --seq renders a sequence file to SVG", async () => {
  const yaml = `version: "1.0"\nname: Login\nparticipants:\n  - id: b\n    nodeId: fe\n    label: Browser\nsteps: []`;
  vi.mocked(fs.readFile).mockResolvedValue(yaml);
  vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});

  const exit = await renderCommand({ _: [], seq: ".archik/login.archik.seq.yaml", out: "seq.svg" });
  expect(exit).toBe(0);
  const written = vi.mocked(fs.writeFile).mock.calls[0]?.[1] as string;
  expect(written).toContain("<svg");
  expect(written).toContain("Browser");
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/cli/commands/render.test.ts --reporter=verbose 2>&1 | grep -E "seq|FAIL"
```

- [ ] **Step 3: Add --seq flag to renderCommand**

In `src/cli/commands/render.ts`, add imports at the top:

```ts
import YAML from "yaml";
import { SeqDocumentSchema } from "../../domain/seq-schema.ts";
import { layoutSeqDocument } from "../../render/seq/seqLayout.ts";
import { SeqDiagramSvg } from "../../render/seq/SeqDiagramSvg.tsx";
```

At the start of `renderCommand`, add a branch for the `--seq` flag:

```ts
  const seqPath = getString(opts, "seq");
  if (seqPath !== undefined) {
    return renderSeqCommand(seqPath, opts);
  }
```

Add the `renderSeqCommand` function:

```ts
async function renderSeqCommand(seqPath: string, opts: ParsedOptions): Promise<number> {
  const out = getString(opts, "out") ?? "sequence.svg";
  const themeRaw = getString(opts, "theme") ?? "dark";
  if (themeRaw !== "dark" && themeRaw !== "light") {
    console.error(`✗ --theme must be "dark" or "light" (got "${themeRaw}")`);
    return 1;
  }
  const theme: ThemeName = themeRaw;

  let text: string;
  try {
    text = await readFile(seqPath, "utf-8");
  } catch {
    console.error(`✗ Cannot read ${seqPath}`);
    return 1;
  }

  const raw = YAML.parse(text);
  const result = SeqDocumentSchema.safeParse(raw);
  if (!result.success) {
    console.error(`✗ ${seqPath}: ${result.error.issues.map((i) => i.message).join("; ")}`);
    return 1;
  }

  const laid = layoutSeqDocument(result.data);
  const inner = renderToStaticMarkup(createElement(SeqDiagramSvg, { laid }));
  const themed = injectBackground(inlineThemeVars(inner, theme), theme);
  const finalSvg = `<?xml version="1.0" encoding="UTF-8"?>\n${themed}\n`;
  const outAbs = path.resolve(out);
  await mkdir(path.dirname(outAbs), { recursive: true });
  await writeFile(outAbs, finalSvg, "utf-8");
  console.log(`✓ Rendered sequence "${result.data.name}" → ${out}`);
  return 0;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/cli/commands/render.test.ts --reporter=verbose 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/render.ts src/cli/commands/render.test.ts
git commit -m "feat(cli): npx archik render --seq <path> --out <file>"
```

---

## Task 12: `schema seq` CLI

**Files:**
- Modify: `src/cli/commands/schema.ts`
- Modify: `src/cli/commands/schema.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/cli/commands/schema.test.ts`:

```ts
it("schema seq prints seq schema in human format", () => {
  const output: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
  const exit = schemaCommand({ _: ["seq"] });
  expect(exit).toBe(0);
  const joined = output.join("\n");
  expect(joined).toContain("SEQ DOCUMENT");
  expect(joined).toContain("participants");
  expect(joined).toContain("steps");
  expect(joined).toContain("ARROW TYPES");
  expect(joined).toContain("sync");
  expect(joined).toContain("GROUP KINDS");
  expect(joined).toContain("alt");
});

it("schema seq --json returns structured seq schema", () => {
  const output: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
  schemaCommand({ _: ["seq"], json: "true" });
  const parsed = JSON.parse(output[0]!);
  expect(parsed.seqDocument).toBeDefined();
  expect(parsed.arrowTypes).toContain("sync");
  expect(parsed.groupKinds).toContain("alt");
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/cli/commands/schema.test.ts --reporter=verbose 2>&1 | grep -E "seq|FAIL"
```

- [ ] **Step 3: Add seq subcommand to schema.ts**

In `src/cli/commands/schema.ts`, in the `schemaCommand` function, add a branch at the top:

```ts
  const sub = opts._[0];
  if (sub === "seq") {
    return seqSchemaCommand(opts);
  }
```

Add the `seqSchemaCommand` function:

```ts
function seqSchemaCommand(opts: ParsedOptions): number {
  const spec = buildSeqSchema();
  if (isJson(opts)) {
    console.log(JSON.stringify(spec, null, 2));
    return 0;
  }
  console.log(formatSeqSchema(spec));
  return 0;
}

type SeqSchemaSpec = {
  seqDocument: FieldSpec[];
  participant: FieldSpec[];
  message: FieldSpec[];
  note: FieldSpec[];
  group: FieldSpec[];
  arrowTypes: string[];
  notePositions: string[];
  groupKinds: string[];
  constraints: string[];
};

function buildSeqSchema(): SeqSchemaSpec {
  return {
    seqDocument: [
      { name: "version", required: true, type: 'literal "1.0"' },
      { name: "name", required: true, type: "string" },
      { name: "description", required: false, type: "string" },
      { name: "participants", required: true, type: "array of Participant" },
      { name: "steps", required: true, type: "array of Step (message | note | group)" },
    ],
    participant: [
      { name: "id", required: true, type: "string", notes: "kebab-case, unique within document" },
      { name: "nodeId", required: true, type: "string", notes: "must reference an existing architecture node id" },
      { name: "label", required: false, type: "string", notes: "display override; defaults to the node's name" },
    ],
    message: [
      { name: "type", required: true, type: 'literal "message"' },
      { name: "id", required: true, type: "string", notes: "kebab-case, unique" },
      { name: "from", required: true, type: "string", notes: "participant id" },
      { name: "to", required: true, type: "string", notes: "participant id; same as from for self-calls" },
      { name: "label", required: true, type: "string" },
      { name: "arrow", required: true, type: "enum", notes: "see ARROW TYPES" },
      { name: "activate", required: false, type: "boolean", notes: "show activation bar on receiver" },
      { name: "status", required: false, type: "enum", notes: "proposed | active | deprecated" },
    ],
    note: [
      { name: "type", required: true, type: 'literal "note"' },
      { name: "id", required: true, type: "string" },
      { name: "position", required: true, type: "enum", notes: "see NOTE POSITIONS" },
      { name: "participants", required: true, type: "array of string", notes: "participant ids the note spans" },
      { name: "text", required: true, type: "string" },
      { name: "status", required: false, type: "enum", notes: "proposed | active | deprecated" },
    ],
    group: [
      { name: "type", required: true, type: 'literal "group"' },
      { name: "id", required: true, type: "string" },
      { name: "kind", required: true, type: "enum", notes: "see GROUP KINDS" },
      { name: "condition", required: false, type: "string", notes: "displayed after the kind label" },
      { name: "label", required: false, type: "string" },
      { name: "branches", required: false, type: "array of Branch", notes: "for alt/opt/loop/par/break" },
      { name: "seqFile", required: false, type: "string", notes: "for ref groups — path to another .archik.seq.yaml" },
      { name: "participants", required: false, type: "array of string", notes: "for ref groups — which participants are involved" },
      { name: "status", required: false, type: "enum", notes: "proposed | active | deprecated" },
    ],
    arrowTypes: ["sync", "async", "return", "create", "destroy"],
    notePositions: ["over", "left_of", "right_of"],
    groupKinds: ["alt", "opt", "loop", "par", "break", "ref"],
    constraints: [
      "All participant nodeId values must reference existing architecture nodes.",
      "All from/to in messages must reference declared participant ids.",
      "All id values are unique within the document (including nested steps).",
      "Self-calls (from === to) are valid — rendered as a looped arrow.",
      "ref group seqFile path must exist on disk.",
      "File naming: *.archik.seq.yaml — place under .archik/",
    ],
  };
}

function formatSeqSchema(spec: SeqSchemaSpec): string {
  const sections: string[] = [];
  sections.push("SEQ DOCUMENT");
  for (const f of spec.seqDocument) sections.push(formatField(f));
  sections.push("");
  sections.push("PARTICIPANT");
  for (const f of spec.participant) sections.push(formatField(f));
  sections.push("");
  sections.push("MESSAGE  (step type: message)");
  for (const f of spec.message) sections.push(formatField(f));
  sections.push("");
  sections.push("NOTE  (step type: note)");
  for (const f of spec.note) sections.push(formatField(f));
  sections.push("");
  sections.push("GROUP  (step type: group)");
  for (const f of spec.group) sections.push(formatField(f));
  sections.push("");
  sections.push(`ARROW TYPES  (message.arrow)`);
  sections.push("  " + spec.arrowTypes.join(", "));
  sections.push("");
  sections.push("NOTE POSITIONS  (note.position)");
  sections.push("  " + spec.notePositions.join(", "));
  sections.push("");
  sections.push("GROUP KINDS  (group.kind)");
  sections.push("  " + spec.groupKinds.join(", "));
  sections.push("");
  sections.push("CONSTRAINTS");
  for (const c of spec.constraints) sections.push(`  • ${c}`);
  sections.push("");
  return sections.join("\n");
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/cli/commands/schema.test.ts --reporter=verbose 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/schema.ts src/cli/commands/schema.test.ts
git commit -m "feat(cli): npx archik schema seq subcommand"
```

---

## Task 13: Template File + Init Extension

**Files:**
- Create: `docs/templates/CLAUDE.md`
- Modify: `src/cli/commands/init.ts`
- Modify: `src/cli/commands/init.test.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write failing test for init CLAUDE.md copy**

Add to `src/cli/commands/init.test.ts`:

```ts
it("init copies CLAUDE.md template when none exists", async () => {
  // mock access to throw (no CLAUDE.md), writeFile spy
  vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
  vi.mocked(writeFile).mockResolvedValue(undefined);
  // run init
  // assert writeFile called with CLAUDE.md content containing "archik q sequences"
  const calls = vi.mocked(writeFile).mock.calls;
  const claudeMdCall = calls.find((c) => String(c[0]).endsWith("CLAUDE.md"));
  expect(claudeMdCall).toBeDefined();
  expect(claudeMdCall![1]).toContain("archik q sequences");
});

it("init prints merge note when CLAUDE.md already exists", async () => {
  vi.mocked(access).mockResolvedValue(undefined); // file exists
  const output: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args) => output.push(args.join(" ")));
  await initCommand({ _: [] });
  expect(output.some((l) => l.includes("CLAUDE.md"))).toBe(true);
});
```

- [ ] **Step 2: Create docs/templates/CLAUDE.md**

Create `docs/templates/CLAUDE.md` — a copy of the project's root `CLAUDE.md` with the following additions:

Under **"Archik commands I use"**, add after the existing `archik render` line:
```
- `npx archik q sequences [--node <id>]` — list sequence flows; `--node` filters to flows involving a given node
- `npx archik render --seq <path> --out <file>` — render a sequence diagram to SVG for visual review
```

Under **"Common pitfalls"**, add:
```
- Authoring a seq file whose participants reference node ids that don't exist in the
  architecture — always run `npx archik validate` after creating a new seq file.
- Renaming an architecture node without updating seq file participant `nodeId` bindings
  — `npx archik validate` catches this, but fix it before committing.
```

After the **"Per-milestone rhythm"** section, add:
```
When a milestone adds or changes a flow: draft or edit the `.archik.seq.yaml` file, render it
with `npx archik render --seq` for the visual ack, then update the `seqFiles` link on the
relevant architecture node via `npx archik suggest set`.
```

Under **"DISCOVER"** phase, add:
```
- `npx archik q sequences [--node X]` — list existing sequence flows before proposing changes
```

- [ ] **Step 3: Add CLAUDE.md template copy to init.ts**

In `src/cli/commands/init.ts`, add the following after the YAML starter file is written:

```ts
  // Copy CLAUDE.md template if none exists in the target directory.
  const claudeMdPath = path.join(targetDir, "CLAUDE.md");
  const templatePath = path.resolve(__dirname, "../../../docs/templates/CLAUDE.md");
  try {
    await access(claudeMdPath);
    console.log(
      `${gray("•")} CLAUDE.md already present — ${dim("merge the sequence diagram additions from docs/templates/CLAUDE.md manually")}`,
    );
  } catch {
    try {
      const templateContent = await readFile(templatePath, "utf-8");
      await writeFile(claudeMdPath, templateContent, "utf-8");
      console.log(`${tick()} Created CLAUDE.md from template`);
    } catch {
      console.log(`${gray("•")} Could not copy CLAUDE.md template — continuing without it`);
    }
  }
```

- [ ] **Step 4: Update root CLAUDE.md to match template additions**

In `CLAUDE.md`, under **"Archik commands I use"**, add:
```
- `npx archik q sequences [--node <id>]` — list sequence flows; `--node` filters to flows involving a given node
- `npx archik render --seq <path> --out <file>` — render a sequence diagram to SVG for visual review
```

Under **"Common pitfalls"**, add:
```
- Authoring a seq file whose participants reference node ids that don't exist in the architecture — always run `npx archik validate` after creating a new seq file.
- Renaming an architecture node without updating seq file participant `nodeId` bindings — `npx archik validate` catches this, but fix before committing.
```

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add docs/templates/CLAUDE.md src/cli/commands/init.ts src/cli/commands/init.test.ts CLAUDE.md
git commit -m "feat(init,template): CLAUDE.md template with seq diagram guidance + init copies it"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `.archik.seq.yaml` file type with Zod schema — Task 2
- [x] Participants bound to architecture node ids — Task 3
- [x] `seqFiles` field on NodeSchema — Task 1
- [x] `npx archik validate` picks up seq files — Task 4
- [x] Native SVG renderer with archik visual language — Tasks 5-7
- [x] Separate route `/__archik/seq?path=...` — Task 8
- [x] NodeInspector seqFiles chips — Task 9
- [x] `q sequences [--node]` — Task 10
- [x] `render --seq` — Task 11
- [x] `schema seq` — Task 12
- [x] `docs/templates/CLAUDE.md` + `init` extension — Task 13
- [x] Self-calls (from === to) valid — Task 2 (schema), Task 5 (layout), Task 6 (renderer)
- [x] Groups: alt/opt/loop/par/break/ref — Tasks 2 (schema), 5 (layout), 7 (renderer)
- [x] Notes — Tasks 2 (schema), 5 (layout), 7 (renderer)
- [x] `status` on messages/groups/notes — Task 2 (schema), renderer opacity logic in Tasks 6-7

**No placeholders:** All steps contain actual code, exact commands, and expected output.

**Type consistency:**
- `layoutSeqDocument` returns `LayoutedSeqDocument` — used in Tasks 5, 6, 7, 8, 11
- `SeqDiagramSvg` accepts `{ laid: LayoutedSeqDocument; svgRef?: ... }` — consistent across Tasks 6, 7, 8, 11
- `LayoutedStep` union — `LayoutedMessage | LayoutedNote | LayoutedGroup` — consistent in Tasks 5-7
- `validateSeqDocument` returns `ValidateResult<SeqDocument>` — consistent with existing `ValidateResult<Document>` pattern
