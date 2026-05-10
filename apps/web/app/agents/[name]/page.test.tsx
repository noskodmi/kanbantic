import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentDetailResponse } from "@kanbantic/shared";

import AgentProfilePage from "./page.js";

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

function detail(): AgentDetailResponse {
  return {
    agent: SAMPLE_AGENT,
    attestations: [],
    recent_bounties: [],
  };
}

/**
 * The page first calls `/api/agents` (label → node lookup) and then
 * `/api/agents/:node` (detail). Route by URL so both calls succeed.
 */
function mockFetchByUrl() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // Detail endpoint must match before the bare list endpoint, since
    // both contain "/api/agents".
    if (url.includes("/api/agents/0x")) {
      return Promise.resolve(jsonResponse(detail()));
    }
    if (url.includes("/api/agents")) {
      return Promise.resolve(jsonResponse({ agents: [SAMPLE_AGENT], limit: 50 }));
    }
    if (url.includes("/api/work")) {
      return Promise.resolve(jsonResponse({ bounties: [], limit: 50 }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as unknown as typeof fetch;
}

describe("/agents/[name] profile page", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("renders the agent's name, owner, and capabilities", async () => {
    globalThis.fetch = mockFetchByUrl();

    const ui = await AgentProfilePage({ params: Promise.resolve({ name: "noskodmi" }) });
    render(ui);

    expect(
      screen.getByRole("heading", { level: 1, name: /noskodmi\.kanbantic\.eth/i }),
    ).toBeInTheDocument();
    // AddressBadge exposes the full address via aria-label so screen readers
    // announce the copy-target verbatim, while the visible text stays truncated.
    expect(
      screen.getByRole("button", {
        name: /copy address 0x44C176989D16f5C2A846cf59d4Cf68Af1006dDdE/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("registry")).toBeInTheDocument();
    expect(screen.getByText("owner", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByText("demo", { selector: "li" })).toBeInTheDocument();
  });
});
