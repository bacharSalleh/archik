import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UseCasesPanel } from "./UseCasesPanel.tsx";

/**
 * UseCasesPanel test harness — mocks fetch for the two endpoints the
 * panel hits (`/__archik/usecases` and `/__archik/trace`). Triggers
 * the popover with a click before fetch is invoked, so the lazy-load
 * effect actually runs.
 */
function mockEndpoints(
  byUrl: Record<string, { status?: number; ok?: boolean; body: unknown }>,
) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      const match = Object.keys(byUrl).find((k) => url.startsWith(k));
      if (!match) {
        throw new Error(`unexpected fetch to ${url}`);
      }
      const r = byUrl[match]!;
      return {
        ok: r.ok ?? true,
        status: r.status ?? 200,
        statusText: "",
        json: async () => r.body,
      } as Response;
    });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE_USECASE = {
  ok: true,
  count: 1,
  useCases: [
    {
      relPath: ".archik/usecases/place-order.archik.uc.yaml",
      id: "place-order",
      name: "Place an order",
      status: "active",
      primaryActor: "customer",
      secondaryActors: ["stripe"],
      slices: [
        {
          id: "happy",
          flows: ["basic"],
          tests: ["tests/happy.spec.ts"],
          realization: { seqFile: ".archik/flow.archik.seq.yaml" },
        },
        {
          id: "rejected",
          flows: ["basic", "declined"],
          tests: ["tests/declined.spec.ts"],
        },
      ],
    },
  ],
};

const SAMPLE_TRACE_FULL_PARTIAL = {
  ok: true,
  summary: {
    useCases: 1,
    slices: 2,
    fullyTraced: 1,
    partial: 1,
    untraced: 0,
  },
  rows: [
    { useCase: "place-order", slice: "happy", level: "full" },
    { useCase: "place-order", slice: "rejected", level: "partial" },
  ],
};

describe("UseCasesPanel", () => {
  it("renders the trigger button collapsed by default", () => {
    mockEndpoints({});
    render(<UseCasesPanel />);
    expect(
      screen.getByRole("button", { name: /use cases/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("loads use cases and trace on first open and renders rows", async () => {
    mockEndpoints({
      "/__archik/usecases": { body: SAMPLE_USECASE },
      "/__archik/trace": { body: SAMPLE_TRACE_FULL_PARTIAL },
    });
    render(<UseCasesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /use cases/i }));

    await waitFor(() => {
      expect(screen.getByText("place-order")).toBeInTheDocument();
    });
    expect(screen.getByText("Place an order")).toBeInTheDocument();
    expect(screen.getByText(/customer/)).toBeInTheDocument();
    expect(screen.getByText(/stripe/)).toBeInTheDocument();
    // Both slices visible.
    expect(screen.getByText("happy")).toBeInTheDocument();
    expect(screen.getByText("rejected")).toBeInTheDocument();
  });

  it("annotates slices with coverage badges from the trace matrix", async () => {
    mockEndpoints({
      "/__archik/usecases": { body: SAMPLE_USECASE },
      "/__archik/trace": { body: SAMPLE_TRACE_FULL_PARTIAL },
    });
    render(<UseCasesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /use cases/i }));
    await waitFor(() => screen.getByText("place-order"));
    // The "fully traced" badge sits on the happy slice.
    expect(screen.getByLabelText("fully traced")).toBeInTheDocument();
    expect(screen.getByLabelText("partially traced")).toBeInTheDocument();
  });

  it("expands a slice to reveal tests and realisation paths", async () => {
    mockEndpoints({
      "/__archik/usecases": { body: SAMPLE_USECASE },
      "/__archik/trace": { body: SAMPLE_TRACE_FULL_PARTIAL },
    });
    render(<UseCasesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /use cases/i }));
    await waitFor(() => screen.getByText("happy"));
    // Click the slice button (its label includes "happy").
    const happyBtn = screen.getByText("happy").closest("button");
    expect(happyBtn).not.toBeNull();
    fireEvent.click(happyBtn!);
    await waitFor(() => {
      expect(screen.getByText(/tests:/)).toBeInTheDocument();
    });
    expect(screen.getByText("tests/happy.spec.ts")).toBeInTheDocument();
    expect(
      screen.getByText(".archik/flow.archik.seq.yaml"),
    ).toBeInTheDocument();
  });

  it("shows the empty state when no use cases exist", async () => {
    mockEndpoints({
      "/__archik/usecases": {
        body: { ok: true, count: 0, useCases: [] },
      },
      "/__archik/trace": {
        body: {
          ok: true,
          summary: { useCases: 0, slices: 0, fullyTraced: 0, partial: 0, untraced: 0 },
          rows: [],
        },
      },
    });
    render(<UseCasesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /use cases/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/No use cases defined/i),
      ).toBeInTheDocument();
    });
  });

  it("shows an error message when the fetch fails", async () => {
    mockEndpoints({
      "/__archik/usecases": { ok: false, status: 500, body: null },
      "/__archik/trace": { ok: false, status: 500, body: null },
    });
    render(<UseCasesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /use cases/i }));
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load/i)).toBeInTheDocument();
    });
  });
});
