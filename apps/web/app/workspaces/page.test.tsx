import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BountyListResponse, BountySummary } from "@kanbantic/shared";

const NODE_A = "0x1111111111111111111111111111111111111111111111111111111111111111";
const NODE_B = "0x2222222222222222222222222222222222222222222222222222222222222222";
const ADMIN = "0x44C176989D16f5C2A846cf59d4Cf68Af1006dDdE";

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
  usePathname: () => "/workspaces",
  useSearchParams: () => new URLSearchParams(),
}));

import WorkspacesPage from "./page.js";

const ORIGINAL_FETCH = globalThis.fetch;

function mockBounty(overrides: Partial<BountySummary>): BountySummary {
  return {
    id: "1",
    poster: "0x1111111111111111111111111111111111111111",
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
    workspace_node: NODE_A,
    arbiter_council: "0x0000000000000000000000000000000000000000",
    created_at_block: 1,
    created_at_ts: Math.floor(Date.now() / 1000) - 60,
    resolved_at_block: null,
    ...overrides,
  };
}

interface WorkspacesApiPayload {
  workspaces: {
    node: string;
    parent: string;
    admin: string;
    created_at_block: number;
    created_at_ts: number;
  }[];
  limit: number;
}

function jsonRes(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Routes mocked fetches by URL: /api/workspaces returns the workspace
 * list, every other URL returns the bounty list. Lets a single
 * `globalThis.fetch` handle both endpoints the page now hits.
 */
function mockFetchBounties(
  bounties: BountyListResponse,
  workspaces: WorkspacesApiPayload = { workspaces: [], limit: 200 },
): void {
  globalThis.fetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
    let url: string;
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else {
      url = input.url;
    }
    if (url.includes("/api/workspaces")) return Promise.resolve(jsonRes(workspaces));
    return Promise.resolve(jsonRes(bounties));
  });
}

function withQueryClient(node: ReactElement): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe("/workspaces browse page", () => {
  beforeEach(() => {
    mockGetLogs.mockReset();
    mockReadContract.mockReset();
    mockFetchBounties({ bounties: [], limit: 50 });
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.clearAllMocks();
  });

  it("renders the empty state when no WorkspaceCreated events exist", async () => {
    mockGetLogs.mockResolvedValue([]);

    render(withQueryClient(<WorkspacesPage />));

    await waitFor(() => {
      expect(screen.getByText(/no workspaces yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /create a workspace/i })).toHaveAttribute(
      "href",
      "/workspaces/new",
    );
  });

  it("renders one card per workspace returned by /api/workspaces", async () => {
    mockFetchBounties(
      { bounties: [mockBounty({ id: "1", workspace_node: NODE_A })], limit: 50 },
      {
        workspaces: [
          {
            node: NODE_A,
            parent: NODE_A,
            admin: ADMIN,
            created_at_block: 100,
            created_at_ts: Math.floor(Date.now() / 1000) - 600,
          },
          {
            node: NODE_B,
            parent: NODE_B,
            admin: ADMIN,
            created_at_block: 200,
            created_at_ts: Math.floor(Date.now() / 1000) - 300,
          },
        ],
        limit: 200,
      },
    );

    render(withQueryClient(<WorkspacesPage />));

    await waitFor(() => {
      expect(screen.getAllByText(/0x111111…111111/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/0x222222…222222/i).length).toBeGreaterThan(0);
    });
  });
});
