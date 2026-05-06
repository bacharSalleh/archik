import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UseCasesPage } from "./UseCasesPage.tsx";

/**
 * UseCasesPage smoke tests. Same fetch-mocking pattern as the panel
 * tests — covers the loading → ready render path, master-rail
 * selection (default and ?uc=<id>), slice card test paths, the seq
 * link with from-uc round-trip, and aggregated trace totals in the
 * header.
 */

function mockEndpoints(
  byUrl: Record<string, { status?: number; ok?: boolean; body: unknown }>,
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const match = Object.keys(byUrl).find((k) => url.startsWith(k));
    if (!match) throw new Error(`unexpected fetch to ${url}`);
    const r = byUrl[match]!;
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.body,
    } as Response;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE_USECASES = {
  ok: true,
  useCases: [
    {
      relPath: ".archik/usecases/place-order.archik.uc.yaml",
      id: "place-order",
      name: "Place an order",
      status: "active",
      primaryActor: "customer",
      secondaryActors: ["stripe"],
      goal: "Customer pays for items in cart and receives confirmation.",
      preconditions: ["Customer is authenticated"],
      postconditions: ["Order persisted with status=PAID"],
      flows: {
        basic: {
          steps: ["Customer submits cart.", "System charges payment."],
        },
        alternates: [
          {
            id: "payment-declined",
            branchFrom: "basic.2",
            steps: ["Payment gateway returns decline."],
          },
        ],
      },
      slices: [
        {
          id: "happy",
          description: "Happy path.",
          flows: ["basic"],
          tests: ["tests/place-order.happy.spec.ts"],
          realization: { seqFile: ".archik/place-order-happy.archik.seq.yaml" },
        },
        {
          id: "declined",
          description: "Card declined branch.",
          flows: ["basic", "payment-declined"],
          tests: ["tests/place-order.declined.spec.ts"],
        },
      ],
    },
    {
      relPath: ".archik/usecases/refund.archik.uc.yaml",
      id: "refund",
      name: "Refund an order",
      status: "active",
      primaryActor: "support",
      goal: "Support agent refunds an order.",
      flows: { basic: { steps: ["Support clicks refund."] } },
      slices: [
        {
          id: "happy",
          description: "Happy refund.",
          flows: ["basic"],
          tests: ["tests/refund.happy.spec.ts"],
        },
      ],
    },
  ],
};

const SAMPLE_TRACE = {
  ok: true,
  rows: [
    {
      useCase: "place-order",
      slice: "happy",
      level: "full",
      // Realistic shape — ECB ratio is derived in the UI from
      // realization.participants[].stereotype.
      realization: {
        seqFile: ".archik/place-order-happy.archik.seq.yaml",
        participants: [
          { participantId: "ui", nodeId: "ui", stereotype: "boundary" },
          { participantId: "svc", nodeId: "svc", stereotype: "control" },
          { participantId: "db", nodeId: "db", stereotype: "entity" },
          { participantId: "log", nodeId: "log" }, // untagged
        ],
      },
    },
    { useCase: "place-order", slice: "declined", level: "partial", realization: null },
    { useCase: "refund", slice: "happy", level: "none", realization: null },
  ],
};

describe("UseCasesPage", () => {
  it("shows loading then renders the rail and detail pane", async () => {
    mockEndpoints({
      "/__archik/usecases": { body: SAMPLE_USECASES },
      "/__archik/trace": { body: SAMPLE_TRACE },
    });
    render(<UseCasesPage selectedId={null} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() =>
      // Detail header shows the use case id (heading-style) once ready.
      expect(screen.getAllByText("place-order").length).toBeGreaterThan(0),
    );
    // Rail lists both use cases (each name appears in the rail row;
    // the selected one ALSO appears in the detail header).
    expect(screen.getAllByText("Place an order").length).toBeGreaterThan(0);
    expect(screen.getByText("Refund an order")).toBeInTheDocument();
  });

  it("defaults the detail pane to the first use case when no ?uc selected", async () => {
    mockEndpoints({
      "/__archik/usecases": { body: SAMPLE_USECASES },
      "/__archik/trace": { body: SAMPLE_TRACE },
    });
    render(<UseCasesPage selectedId={null} />);
    await waitFor(() =>
      expect(screen.getByText(/Customer pays for items/)).toBeInTheDocument(),
    );
  });

  it("respects ?uc=<id> by selecting that use case in the detail pane", async () => {
    mockEndpoints({
      "/__archik/usecases": { body: SAMPLE_USECASES },
      "/__archik/trace": { body: SAMPLE_TRACE },
    });
    render(<UseCasesPage selectedId="refund" />);
    await waitFor(() =>
      expect(
        screen.getByText("Support agent refunds an order."),
      ).toBeInTheDocument(),
    );
    // place-order's goal text should NOT be in the detail pane.
    expect(screen.queryByText(/Customer pays for items/)).toBeNull();
  });

  it("falls back to the first use case when ?uc is unknown (stale URL)", async () => {
    mockEndpoints({
      "/__archik/usecases": { body: SAMPLE_USECASES },
      "/__archik/trace": { body: SAMPLE_TRACE },
    });
    render(<UseCasesPage selectedId="ghost" />);
    await waitFor(() =>
      expect(screen.getByText(/Customer pays for items/)).toBeInTheDocument(),
    );
  });

  it("surfaces test paths and seq link with from-uc round-trip", async () => {
    mockEndpoints({
      "/__archik/usecases": { body: SAMPLE_USECASES },
      "/__archik/trace": { body: SAMPLE_TRACE },
    });
    render(<UseCasesPage selectedId="place-order" />);
    await waitFor(() =>
      expect(
        screen.getByText("tests/place-order.happy.spec.ts"),
      ).toBeInTheDocument(),
    );
    // Realised slice shows a seq link; the href carries from-uc so the
    // seq page back-button can return to this use case.
    const links = screen.getAllByRole("link");
    const seqLink = links.find((a) =>
      a.getAttribute("href")?.includes("/__archik/seq?path="),
    );
    expect(seqLink).toBeDefined();
    expect(seqLink!.getAttribute("href")).toContain("from-uc=place-order");
  });

  it("derives the ECB ratio from realization.participants on each slice", async () => {
    mockEndpoints({
      "/__archik/usecases": { body: SAMPLE_USECASES },
      "/__archik/trace": { body: SAMPLE_TRACE },
    });
    render(<UseCasesPage selectedId="place-order" />);
    await waitFor(() =>
      expect(
        screen.getByText("tests/place-order.happy.spec.ts"),
      ).toBeInTheDocument(),
    );
    // happy slice has 3 of 4 participants stereotyped → "ECB 3/4".
    expect(screen.getByText(/ECB 3\/4/)).toBeInTheDocument();
  });

  it("aggregates trace totals in the header", async () => {
    mockEndpoints({
      "/__archik/usecases": { body: SAMPLE_USECASES },
      "/__archik/trace": { body: SAMPLE_TRACE },
    });
    render(<UseCasesPage selectedId={null} />);
    await waitFor(() => screen.getByText(/1 full/));
    expect(screen.getByText(/1 full/)).toBeInTheDocument();
    expect(screen.getByText(/1 partial/)).toBeInTheDocument();
    expect(screen.getByText(/1 untraced/)).toBeInTheDocument();
  });

  it("shows an empty-state message when no use cases are defined", async () => {
    mockEndpoints({
      "/__archik/usecases": { body: { ok: true, useCases: [] } },
      "/__archik/trace": { body: { ok: true, rows: [] } },
    });
    render(<UseCasesPage selectedId={null} />);
    await waitFor(() =>
      expect(screen.getByText(/No use cases defined/)).toBeInTheDocument(),
    );
  });

  it("shows an error message when the fetch fails", async () => {
    mockEndpoints({
      "/__archik/usecases": { ok: false, status: 500, body: null },
      "/__archik/trace": { body: SAMPLE_TRACE },
    });
    render(<UseCasesPage selectedId={null} />);
    await waitFor(() =>
      expect(screen.getByText(/Couldn't load/)).toBeInTheDocument(),
    );
  });
});
