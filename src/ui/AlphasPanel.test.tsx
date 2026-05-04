import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AlphasPanel } from "./AlphasPanel.tsx";

function mockAlphas(body: unknown, ok = true): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      ({
        ok,
        status: ok ? 200 : 500,
        statusText: "",
        json: async () => body,
      }) as Response,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

const FOUR_ALPHAS_VERIFIED = {
  ok: true,
  file: ".archik/alphas.archik.alphas.yaml",
  alphas: [
    {
      alpha: "stakeholders",
      state: "represented",
      ladderIndex: 1,
      ladderLength: 6,
      verification: "verified",
      note: "human + system actor in place",
      evidence: ["customer (human)", "stripe (external-system)"],
    },
    {
      alpha: "requirements",
      state: "acceptable",
      ladderIndex: 3,
      ladderLength: 6,
      verification: "verified",
    },
    {
      alpha: "softwareSystem",
      state: "ready",
      ladderIndex: 3,
      ladderLength: 6,
      verification: "over-claimed",
      reason: "Trace matrix has 1 active slice below 'full': place-order/rejected (partial)",
    },
    {
      alpha: "work",
      state: "concluded",
      ladderIndex: 4,
      ladderLength: 6,
      verification: "subjective",
    },
  ],
};

describe("AlphasPanel", () => {
  it("renders the trigger button collapsed by default", () => {
    mockAlphas({});
    render(<AlphasPanel />);
    expect(
      screen.getByRole("button", { name: /alphas/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("renders all four alpha cards on open", async () => {
    mockAlphas(FOUR_ALPHAS_VERIFIED);
    render(<AlphasPanel />);
    fireEvent.click(screen.getByRole("button", { name: /alphas/i }));
    await waitFor(() => {
      expect(screen.getByText("Stakeholders")).toBeInTheDocument();
    });
    expect(screen.getByText("Requirements")).toBeInTheDocument();
    expect(screen.getByText("Software System")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("shows the verification badge label on each card", async () => {
    mockAlphas(FOUR_ALPHAS_VERIFIED);
    render(<AlphasPanel />);
    fireEvent.click(screen.getByRole("button", { name: /alphas/i }));
    await waitFor(() => screen.getByText("Stakeholders"));
    expect(screen.getAllByLabelText(/verified/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText(/over-claimed/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/subjective/i)).toBeInTheDocument();
  });

  it("expands an over-claimed card and shows the failure reason", async () => {
    mockAlphas(FOUR_ALPHAS_VERIFIED);
    render(<AlphasPanel />);
    fireEvent.click(screen.getByRole("button", { name: /alphas/i }));
    await waitFor(() => screen.getByText("Software System"));
    const card = screen.getByText("Software System").closest("button");
    expect(card).not.toBeNull();
    fireEvent.click(card!);
    await waitFor(() => {
      expect(
        screen.getByText(/Trace matrix has 1 active slice below 'full'/),
      ).toBeInTheDocument();
    });
  });

  it("expands a verified card with note + evidence", async () => {
    mockAlphas(FOUR_ALPHAS_VERIFIED);
    render(<AlphasPanel />);
    fireEvent.click(screen.getByRole("button", { name: /alphas/i }));
    await waitFor(() => screen.getByText("Stakeholders"));
    const card = screen.getByText("Stakeholders").closest("button");
    expect(card).not.toBeNull();
    fireEvent.click(card!);
    await waitFor(() => {
      expect(screen.getByText(/human \+ system actor in place/)).toBeInTheDocument();
    });
    expect(screen.getByText(/customer \(human\)/)).toBeInTheDocument();
  });

  it("shows the empty state when no alphas file exists", async () => {
    mockAlphas({
      ok: true,
      file: null,
      alphas: [
        { alpha: "stakeholders", state: null, ladderIndex: -1, ladderLength: 6, verification: "missing" },
        { alpha: "requirements", state: null, ladderIndex: -1, ladderLength: 6, verification: "missing" },
        { alpha: "softwareSystem", state: null, ladderIndex: -1, ladderLength: 6, verification: "missing" },
        { alpha: "work", state: null, ladderIndex: -1, ladderLength: 6, verification: "missing" },
      ],
    });
    render(<AlphasPanel />);
    fireEvent.click(screen.getByRole("button", { name: /alphas/i }));
    await waitFor(() => {
      expect(screen.getByText(/No alphas file yet/)).toBeInTheDocument();
    });
  });

  it("shows an error message when the fetch fails", async () => {
    mockAlphas(null, false);
    render(<AlphasPanel />);
    fireEvent.click(screen.getByRole("button", { name: /alphas/i }));
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load/)).toBeInTheDocument();
    });
  });
});
