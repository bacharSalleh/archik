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
