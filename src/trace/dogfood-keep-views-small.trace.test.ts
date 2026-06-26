/**
 * Dogfood: concrete trace of archik's own `keep-views-small` use case —
 * run the real complexity metrics on archik's own model and record the
 * actual findings, bound to the complexity sequence diagram.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { discoverDocs } from "../io/discovery.ts";
import { analyzeComplexity, DEFAULT_LIMITS } from "../domain/complexity.ts";
import { trace } from "./recorder.ts";

const REPO = path.resolve(__dirname, "../..");

describe("dogfood: concrete trace of keep-views-small/complexity-report", () => {
  it("runs the real complexity check on archik's model and records a bound trace", async () => {
    const main = path.join(REPO, ".archik/main.archik.yaml");
    const discovery = await discoverDocs(main, REPO);
    const findings = analyzeComplexity(discovery.docs, DEFAULT_LIMITS);

    // archik's own single-file model is over the strict defaults.
    expect(findings.length).toBeGreaterThan(0);

    trace({
      useCase: "keep-views-small",
      slice: "complexity-report",
      seqFile: ".archik/keep-views-small.archik.seq.yaml",
    })
      .step({
        id: "run-complexity",
        from: "cli",
        to: "domain",
        label: "analyzeComplexity(docs, limits)",
        in: { limits: DEFAULT_LIMITS },
      })
      .step({
        id: "measure",
        from: "domain",
        to: "domain",
        label: "per-file nodes/edges, container children, node degree, nesting depth",
      })
      .step({
        id: "findings",
        from: "domain",
        to: "cli",
        label: "findings (worst-first) + concrete fix each — advisory, exit 0",
        out: {
          count: findings.length,
          findings: findings.map((f) => ({ kind: f.kind, subject: f.subject, value: f.value, limit: f.limit })),
        },
      })
      .flush();
  });
});
