import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BountyListResponse, BountySummary } from "@kanbantic/shared";

import ContractIntelligenceDashboardPage from "./page.js";

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockBounty(overrides: Partial<BountySummary>): BountySummary {
  return {
    id: "1",
    poster: "0x1111111111111111111111111111111111111111",
    capability: "research",
    reward: "1000000000000000000",
    description_ref: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    expires_at: 0,
    claim_window_blocks: 0,
    status: "Open",
    claimer_node: null,
    claimer_address: null,
    workspace_node: "0x0000000000000000000000000000000000000000000000000000000000000000",
    arbiter_council: "0x8B491130cc3Be0991824e4e6411B66B3066256c7",
    created_at_block: 1,
    created_at_ts: Math.floor(Date.now() / 1000) - 60,
    resolved_at_block: null,
    ...overrides,
  };
}

function mockFetch(payload: BountyListResponse): void {
  globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(payload)) as typeof fetch;
}

async function renderCIDashboard(): Promise<void> {
  const Element = await ContractIntelligenceDashboardPage();
  render(Element);
}

describe("/dashboard/contract-intelligence", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.clearAllMocks();
  });

  it("filters to audit/explain/similarity bounties only and links to Sourcify", async () => {
    mockFetch({
      bounties: [
        mockBounty({ id: "1", capability: "audit" }),
        mockBounty({ id: "2", capability: "research" }),
        mockBounty({ id: "3", capability: "EXPLAIN" }),
      ],
      limit: 50,
    });

    await renderCIDashboard();

    expect(screen.getByText("audit")).toBeInTheDocument();
    expect(screen.getByText("EXPLAIN")).toBeInTheDocument();
    expect(screen.queryByText("research")).not.toBeInTheDocument();

    const sourcifyLinks = screen.getAllByRole("link", { name: /sourcify lookup/i });
    expect(sourcifyLinks.length).toBeGreaterThan(0);
    expect(sourcifyLinks[0]?.getAttribute("href")).toContain("https://sourcify.dev/lookup/");
  });

  it("renders the empty state with the post-an-audit CTA when no CI bounties exist", async () => {
    mockFetch({
      bounties: [mockBounty({ capability: "research" })],
      limit: 50,
    });

    await renderCIDashboard();

    expect(
      screen.getByRole("heading", { level: 2, name: /no contract intelligence audits yet/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /post an audit bounty/i })).toHaveAttribute(
      "href",
      "/post",
    );
  });

  it("renders the spec §6 mission footer", async () => {
    mockFetch({ bounties: [], limit: 50 });

    await renderCIDashboard();

    expect(screen.getByText(/why contract intelligence/i)).toBeInTheDocument();
  });
});
