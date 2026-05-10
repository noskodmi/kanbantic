import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BountyListResponse, BountySummary } from "@kanbantic/shared";

const ADMIN = "0x44C176989D16f5C2A846cf59d4Cf68Af1006dDdE";
const MEMBER_A = "0x1111111111111111111111111111111111111111";
const _MEMBER_B = "0x2222222222222222222222222222222222222222";
// namehash("alpha.kanbantic.eth") computed with viem at write time:
// we just feed the slug "alpha" to the page and let the component compute it.
const SLUG = "alpha";

const mockGetLogs = vi.fn();
const mockReadContract = vi.fn();

vi.mock("wagmi", () => ({
  usePublicClient: () => ({
    getLogs: mockGetLogs,
    readContract: mockReadContract,
  }),
  useAccount: () => ({ isConnected: false, address: undefined }),
  useWriteContract: () => ({
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useWaitForTransactionReceipt: () => ({
    isLoading: false,
    isSuccess: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/workspaces/alpha",
  useSearchParams: () => new URLSearchParams(),
}));

import WorkspaceDetailPage from "./page.js";

const ORIGINAL_FETCH = globalThis.fetch;

function mockBounty(overrides: Partial<BountySummary>): BountySummary {
  return {
    id: "1",
    poster: ADMIN,
    capability: "task",
    reward: "1000000000000000000",
    description_ref: "0xdead",
    expires_at: 0,
    claim_window_blocks: 0,
    claim_window_start_block: null,
    status: "Open",
    claimer_node: null,
    claimer_address: null,

    submission_ref: null,
    workspace_node: "0x0000000000000000000000000000000000000000000000000000000000000000",
    arbiter_council: "0x0000000000000000000000000000000000000000",
    created_at_block: 1,
    created_at_ts: Math.floor(Date.now() / 1000) - 60,
    resolved_at_block: null,
    ...overrides,
  };
}

function mockFetchBounties(payload: BountyListResponse): void {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as typeof fetch;
}

function withQueryClient(node: ReactElement): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

async function renderDetail(): Promise<void> {
  const Element = await WorkspaceDetailPage({
    params: Promise.resolve({ name: SLUG }),
  });
  render(withQueryClient(Element));
}

describe("/workspaces/[name] detail page", () => {
  beforeEach(() => {
    mockGetLogs.mockReset();
    mockReadContract.mockReset();
    mockFetchBounties({ bounties: [], limit: 50 });
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.clearAllMocks();
  });

  it("renders the member roster from the on-chain membersOf view (which includes the admin)", async () => {
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "exists") return Promise.resolve(true);
      if (functionName === "adminOf") return Promise.resolve(ADMIN);
      // membersOf returns the full active set — the admin AND any
      // explicitly-added members. Removed members are filtered out
      // by the contract before this returns.
      if (functionName === "membersOf") return Promise.resolve([ADMIN, MEMBER_A]);
      return Promise.resolve(null);
    });

    await renderDetail();

    await waitFor(() => {
      // 2 active members: ADMIN + MEMBER_A. MEMBER_B was removed
      // (so membersOf doesn't return it).
      expect(screen.getByText(/Members \(2\)/i)).toBeInTheDocument();
    });

    // Header and roster both surface the workspace name.
    expect(screen.getAllByText(/alpha\.kanbantic\.eth/i).length).toBeGreaterThan(0);
  });

  it("filters bounties by workspace_node and surfaces the empty bounty state otherwise", async () => {
    mockReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "exists") return Promise.resolve(true);
      if (functionName === "adminOf") return Promise.resolve(ADMIN);
      return Promise.resolve(null);
    });

    mockGetLogs.mockResolvedValue([]);
    // No bounties match this workspace_node.
    mockFetchBounties({
      bounties: [
        mockBounty({
          id: "1",
          workspace_node: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        }),
      ],
      limit: 50,
    });

    await renderDetail();

    await waitFor(() => {
      expect(screen.getByText(/no tasks have been posted/i)).toBeInTheDocument();
    });
  });
});
