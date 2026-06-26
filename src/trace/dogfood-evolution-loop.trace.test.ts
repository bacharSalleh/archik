/**
 * Dogfood: concrete trace of archik's own `evolution-loop` use case
 * (reflect→propose leg), bound to its sequence diagram. A real reflect
 * run needs a seeded event history, so this records a representative run
 * with the shape the recorder produces from a live `evolution reflect`.
 */
import { describe, it } from "vitest";
import { trace } from "./recorder.ts";

describe("dogfood: concrete trace of evolution-loop/reflect-propose", () => {
  it("records a bound trace of the reflect→propose leg", () => {
    trace({
      useCase: "evolution-loop",
      slice: "reflect-propose",
      seqFile: ".archik/evolution-loop.archik.seq.yaml",
    })
      .step({ id: "reflect", from: "cli", to: "domain", label: "reflect (derive insights from usage)", in: { command: "archik evolution reflect" } })
      .step({ id: "read-events", from: "domain", to: "store", label: "read events.jsonl (accepts / rejects / runs)", out: { events: 14 } })
      .step({ id: "events", from: "store", to: "domain", label: "observed events", out: { rejects: 3, accepts: 9, runs: 2 } })
      .step({ id: "write-proposals", from: "domain", to: "store", label: "write pending proposals + reflection log", in: { proposals: 1 } })
      .step({ id: "proposals-ready", from: "domain", to: "cli", label: "N pending proposals (each with evidence)", out: { pending: 1, evidence: ["3 rejects of the same boundary shape"] } })
      .flush();
  });
});
