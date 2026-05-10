import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BountyDetailResponse, BountySummary } from "@kanbantic/shared";

// Page renders <WorkActions> (client island) which calls wagmi/rainbowkit
// hooks. Provider stack isn't wired up in unit tests — mock the hook
// surface so rendering completes. Detailed CTA branching is covered by
// `_ui/WorkActions.test.tsx`.
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
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
  ConnectButton: () => null,
}));

import WorkDetailPage from "./page.js";

function withQueryClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const ORIGINAL_FETCH = globalThis.fetch;

function mockBounty(overrides: Partial<BountySummary>): BountySummary {
  return {
    id: "1",
    poster: "0x1111111111111111111111111111111111111111",
    capability: "translate-en-to-fr",
    reward: "1000000000000000000",
    description_ref: "0xabc",
    expires_at: 0,
    claim_window_blocks: 0,
    claim_window_start_block: null,
    status: "Open",
    claimer_node: null,
    claimer_address: null,
    workspace_node: "0x0000000000000000000000000000000000000000000000000000000000000000",
    arbiter_council: "0x0000000000000000000000000000000000000000",
    created_at_block: 1,
    created_at_ts: Math.floor(Date.now() / 1000) - 60,
    resolved_at_block: null,
    ...overrides,
  };
}

/**
 * The page now calls `/api/work/:id` (returns `BountyDetailResponse`).
 * The legacy mock that returned a `BountyListResponse` no longer
 * matches the wire shape — tests pass the detail payload directly.
 */
function mockFetchDetail(detail: BountyDetailResponse | null): void {
  globalThis.fetch = vi.fn().mockImplementation(() => {
    if (detail === null) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(detail), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
}

function detailFor(bounty: BountySummary): BountyDetailResponse {
  return {
    bounty,
    history: [],
    claimer_agent: null,
    attestations: [],
  };
}

async function renderDetail(id: string): Promise<void> {
  const Element = await WorkDetailPage({ params: Promise.resolve({ id }) });
  render(withQueryClient(Element));
}

describe("/work/[id] detail page", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("renders bounty id, reward, and status pill for an Open bounty", async () => {
    mockFetchDetail(
      detailFor(
        mockBounty({
          id: "42",
          capability: "summarize-paper",
          reward: "250000000000000000",
          status: "Open",
        }),
      ),
    );

    await renderDetail("42");

    expect(screen.getByRole("heading", { level: 1, name: /summarize-paper/i })).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText(/0\.25 ETH/)).toBeInTheDocument();
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
  });

  it("hides the claimer section when the bounty status is Open", async () => {
    mockFetchDetail(detailFor(mockBounty({ id: "7", status: "Open" })));

    await renderDetail("7");

    expect(screen.queryByRole("heading", { name: /claimer/i })).not.toBeInTheDocument();
  });

  it("renders the proof viewer placeholder for Submitted bounties", async () => {
    mockFetchDetail(
      detailFor(
        mockBounty({
          id: "9",
          status: "Submitted",
          claimer_node: "alpha.kanbantic.eth",
          claimer_address: "0x3333333333333333333333333333333333333333",
        }),
      ),
    );

    await renderDetail("9");

    expect(screen.getByTestId("proof-viewer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /proof of work/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /claimer/i })).toBeInTheDocument();
  });
});
