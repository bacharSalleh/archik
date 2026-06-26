import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TracePage } from "./TracePage.tsx";
import type { TraceDocument } from "../domain/trace-schema.ts";

const fixtureTrace: TraceDocument = {
  version: "1.0",
  useCase: "place-order",
  slice: "happy",
  seqFile: ".archik/flow.archik.seq.yaml",
  recordedAt: "2026-06-26T10:00:00.000Z",
  steps: [
    {
      from: "browser",
      to: "gateway",
      label: "POST /login",
      status: "ok",
      data: {
        in: { email: "a@b.com", password: "hunter2" },
        out: { token: "jwt-abc-123" },
      },
    },
    {
      from: "gateway",
      to: "db",
      label: "lookup user",
      status: "error",
    },
  ],
};

describe("TracePage", () => {
  it("renders each step's from→to and label", () => {
    render(<TracePage trace={fixtureTrace} />);
    expect(screen.getByText("POST /login")).toBeInTheDocument();
    expect(screen.getByText("lookup user")).toBeInTheDocument();
    // Both participant ids of the first step are visible.
    expect(screen.getAllByText("browser").length).toBeGreaterThan(0);
    expect(screen.getAllByText("gateway").length).toBeGreaterThan(0);
    expect(screen.getAllByText("db").length).toBeGreaterThan(0);
  });

  it("shows the use case / slice header and recordedAt", () => {
    render(<TracePage trace={fixtureTrace} />);
    expect(screen.getAllByText(/place-order/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/happy/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2026-06-26/)).toBeInTheDocument();
  });

  it("notes the bound seq file when seqFile is set", () => {
    render(<TracePage trace={fixtureTrace} />);
    expect(
      screen.getByText(/\.archik\/flow\.archik\.seq\.yaml/),
    ).toBeInTheDocument();
  });

  it("marks an errored step", () => {
    render(<TracePage trace={fixtureTrace} />);
    expect(screen.getByLabelText("error")).toBeInTheDocument();
  });

  it("expands a step to show its in/out JSON", () => {
    render(<TracePage trace={fixtureTrace} />);
    // The first step's in/out values are hidden until expanded.
    expect(screen.queryByText(/hunter2/)).not.toBeInTheDocument();
    const stepBtn = screen.getByText("POST /login").closest("button");
    expect(stepBtn).not.toBeNull();
    fireEvent.click(stepBtn!);
    expect(screen.getByText(/hunter2/)).toBeInTheDocument();
    expect(screen.getByText(/jwt-abc-123/)).toBeInTheDocument();
  });
});
