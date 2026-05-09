import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BountyListResponse, BountySummary } from "@kanbantic/shared";

vi.mock("wagmi", () => ({
  useAccount: vi.fn(),
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dashboard/client",
  useSearchParams: () => new URLSearchParams(),
}));

import { useAccount } from "wagmi";

import ClientDashboardPage from "./page.js";

const mockedUseAccount = vi.mocked(useAccount);

const ORIGINAL_FETCH = globalThis.fetch;

const POSTER = "0x44C176989D16f5C2A846cf59d4Cf68Af1006dDdE";
const OTHER = "0x1111111111111111111111111111111111111111";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockBounty(overrides: Partial<BountySummary>): BountySummary {
  return {
    id: "1",
    poster: POSTER,
    capability: "research",
    reward: "1000000000000000000",
    description_ref: "0xdead",
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

async function renderClientDashboard(): Promise<void> {
  const Element = await ClientDashboardPage();
  render(Element);
}

describe("/dashboard/client", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.clearAllMocks();
  });

  it("renders the connect prompt when no wallet is connected", async () => {
    mockFetch({ bounties: [], limit: 50 });
    mockedUseAccount.mockReturnValue({
      isConnected: false,
      address: undefined,
    } as unknown as ReturnType<typeof useAccount>);

    await renderClientDashboard();

    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
  });

  it("shows posted bounties for the connected wallet only", async () => {
    mockFetch({
      bounties: [
        mockBounty({ id: "1", poster: POSTER, capability: "mine-task" }),
        mockBounty({ id: "2", poster: OTHER, capability: "their-task" }),
      ],
      limit: 50,
    });
    mockedUseAccount.mockReturnValue({
      isConnected: true,
      address: POSTER,
    } as unknown as ReturnType<typeof useAccount>);

    await renderClientDashboard();

    expect(screen.getByText("mine-task")).toBeInTheDocument();
    expect(screen.queryByText("their-task")).not.toBeInTheDocument();
  });

  it("shows the empty CTA when wallet has posted nothing", async () => {
    mockFetch({
      bounties: [mockBounty({ poster: OTHER })],
      limit: 50,
    });
    mockedUseAccount.mockReturnValue({
      isConnected: true,
      address: POSTER,
    } as unknown as ReturnType<typeof useAccount>);

    await renderClientDashboard();

    expect(
      screen.getByRole("heading", { level: 2, name: /no bounties posted from this wallet/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /post a bounty/i })).toHaveAttribute("href", "/post");
  });
});
