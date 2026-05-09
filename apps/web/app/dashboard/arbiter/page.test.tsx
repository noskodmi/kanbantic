import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BountyListResponse, BountySummary } from "@kanbantic/shared";
import { sepoliaDeployment } from "@kanbantic/shared";

vi.mock("wagmi", () => ({
  useAccount: vi.fn(),
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}));

import { useAccount } from "wagmi";

import ArbiterDashboardPage from "./page.js";

const mockedUseAccount = vi.mocked(useAccount);

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
    description_ref: "0xdead",
    expires_at: 0,
    claim_window_blocks: 0,
    status: "Open",
    claimer_node: null,
    claimer_address: null,
    workspace_node: "0x0000000000000000000000000000000000000000000000000000000000000000",
    arbiter_council: sepoliaDeployment.contracts.ArbiterCouncil,
    created_at_block: 1,
    created_at_ts: Math.floor(Date.now() / 1000) - 60,
    resolved_at_block: null,
    ...overrides,
  };
}

function mockFetch(payload: BountyListResponse): void {
  globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(payload)) as typeof fetch;
}

async function renderArbiterDashboard(): Promise<void> {
  const Element = await ArbiterDashboardPage();
  render(Element);
}

describe("/dashboard/arbiter", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.clearAllMocks();
  });

  it("only surfaces Disputed bounties for the configured council", async () => {
    mockFetch({
      bounties: [
        mockBounty({ id: "1", capability: "open-task", status: "Open" }),
        mockBounty({ id: "2", capability: "disputed-task", status: "Disputed" }),
        mockBounty({
          id: "3",
          capability: "other-council",
          status: "Disputed",
          arbiter_council: "0x9999999999999999999999999999999999999999",
        }),
      ],
      limit: 50,
    });
    mockedUseAccount.mockReturnValue({
      isConnected: true,
      address: "0x44C176989D16f5C2A846cf59d4Cf68Af1006dDdE",
    } as unknown as ReturnType<typeof useAccount>);

    await renderArbiterDashboard();

    expect(screen.getByText("disputed-task")).toBeInTheDocument();
    expect(screen.queryByText("open-task")).not.toBeInTheDocument();
    expect(screen.queryByText("other-council")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view votes/i })).toHaveAttribute("href", "/work/2");
  });

  it("shows the no-disputes empty state when nothing is disputed", async () => {
    mockFetch({ bounties: [], limit: 50 });
    mockedUseAccount.mockReturnValue({
      isConnected: true,
      address: "0x44C176989D16f5C2A846cf59d4Cf68Af1006dDdE",
    } as unknown as ReturnType<typeof useAccount>);

    await renderArbiterDashboard();

    expect(
      screen.getByRole("heading", { level: 2, name: /no active disputes/i }),
    ).toBeInTheDocument();
  });
});
