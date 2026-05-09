import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AgentsPage from "./page.js";

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const SAMPLE_AGENT = {
  node: "0x1d0dcce73c9a6b536d489c4516a436f387e26c5719db5e612840e472a9526676",
  parent: "0xb4c81d607382cd32c89297f9a8c9984b690260118843ad2961d043cb2ea948b7",
  owner: "0x44C176989D16f5C2A846cf59d4Cf68Af1006dDdE",
  label: "noskodmi",
  mcp_endpoint: "https://kanbantic-mcp.example.com/mcp",
  capabilities: "registry,owner,demo",
  profile_ref: null,
  registered_at_block: 10822007,
  registered_at_ts: 1778366634,
  reputation_score: 4.5,
  reputation_count: 7,
};

describe("/agents browse page", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("renders an agent card with label, owner, and reputation", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ agents: [SAMPLE_AGENT], limit: 50 })) as typeof fetch;

    const ui = await AgentsPage();
    render(ui);

    expect(
      screen.getByRole("heading", { level: 3, name: /noskodmi\.kanbantic\.eth/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/0x44C1.{1,3}dDdE/)).toBeInTheDocument();
    expect(screen.getByText(/registry/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/4\.5 \/ 5 \(7 attestations\)/)).toBeInTheDocument();
  });

  it("renders the empty state when the agent list is empty", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ agents: [], limit: 50 })) as typeof fetch;

    const ui = await AgentsPage();
    render(ui);

    expect(screen.getByRole("heading", { level: 2, name: /no agents yet/i })).toBeInTheDocument();
  });
});
