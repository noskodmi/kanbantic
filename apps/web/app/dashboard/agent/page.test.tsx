import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentSummary, BountySummary } from "@kanbantic/shared";

vi.mock("wagmi", () => ({
  useAccount: vi.fn(),
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}));

import { useAccount } from "wagmi";

import AgentDashboardPage from "./page.js";

const mockedUseAccount = vi.mocked(useAccount);

const ORIGINAL_FETCH = globalThis.fetch;

const OWNER = "0x44C176989D16f5C2A846cf59d4Cf68Af1006dDdE";
const OTHER_OWNER = "0x1111111111111111111111111111111111111111";
const AGENT_NODE = "0x1d0dcce73c9a6b536d489c4516a436f387e26c5719db5e612840e472a9526676";

const SAMPLE_AGENT: AgentSummary = {
  node: AGENT_NODE,
  parent: "0xb4c81d607382cd32c89297f9a8c9984b690260118843ad2961d043cb2ea948b7",
  owner: OWNER,
  label: "noskodmi",
  mcp_endpoint: "https://example.com/mcp",
  capabilities: "research,audit",
  profile_ref: null,
  registered_at_block: 1,
  registered_at_ts: 1700000000,
  reputation_score: 4.5,
  reputation_count: 7,
};

const NO_BOUNTIES: BountySummary[] = [];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockFetchAgentsAndWork(agents: AgentSummary[], bounties: BountySummary[]) {
  globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/agents")) {
      return Promise.resolve(jsonResponse({ agents, limit: 50 }));
    }
    return Promise.resolve(jsonResponse({ bounties, limit: 50 }));
  }) as typeof fetch;
}

async function renderAgentDashboard(): Promise<void> {
  const Element = await AgentDashboardPage();
  render(Element);
}

describe("/dashboard/agent", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.clearAllMocks();
  });

  it("renders the connect prompt when no wallet is connected", async () => {
    mockFetchAgentsAndWork([SAMPLE_AGENT], NO_BOUNTIES);
    mockedUseAccount.mockReturnValue({
      isConnected: false,
      address: undefined,
    } as unknown as ReturnType<typeof useAccount>);

    await renderAgentDashboard();

    expect(screen.getByRole("heading", { level: 1, name: /agent dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("shows the no-agents empty state with /register CTA when wallet owns nothing", async () => {
    mockFetchAgentsAndWork([SAMPLE_AGENT], NO_BOUNTIES);
    mockedUseAccount.mockReturnValue({
      isConnected: true,
      address: OTHER_OWNER,
    } as unknown as ReturnType<typeof useAccount>);

    await renderAgentDashboard();

    expect(
      screen.getByRole("heading", { level: 2, name: /haven't registered any agents yet/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /register an agent/i })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("renders an owned agent row with label and capability tags", async () => {
    mockFetchAgentsAndWork([SAMPLE_AGENT], NO_BOUNTIES);
    mockedUseAccount.mockReturnValue({
      isConnected: true,
      address: OWNER,
    } as unknown as ReturnType<typeof useAccount>);

    await renderAgentDashboard();

    expect(screen.getByRole("link", { name: /noskodmi\.kanbantic\.eth/i })).toBeInTheDocument();
    expect(screen.getByText(/research/)).toBeInTheDocument();
    expect(screen.getByText(/audit/)).toBeInTheDocument();
    expect(screen.getByText(/bounties claimed/i)).toBeInTheDocument();
  });

  it("arms the Umia spin-out CTA when settled revenue ≥ 0.005 ETH", async () => {
    const bounties: BountySummary[] = [
      {
        id: "1",
        poster: OTHER_OWNER,
        capability: "research",
        // 0.005 ETH exactly
        reward: "5000000000000000",
        description_ref: "0xdead",
        expires_at: 0,
        claim_window_blocks: 0,
        status: "Resolved",
        claimer_node: AGENT_NODE,
        claimer_address: OWNER,
        workspace_node: "0x0000000000000000000000000000000000000000000000000000000000000000",
        arbiter_council: "0x8B491130cc3Be0991824e4e6411B66B3066256c7",
        created_at_block: 1,
        created_at_ts: 1700000000,
        resolved_at_block: 2,
      },
    ];
    mockFetchAgentsAndWork([SAMPLE_AGENT], bounties);
    mockedUseAccount.mockReturnValue({
      isConnected: true,
      address: OWNER,
    } as unknown as ReturnType<typeof useAccount>);

    await renderAgentDashboard();

    expect(screen.getByRole("button", { name: /spin out as umia venture/i })).toBeInTheDocument();
    expect(screen.getByText(/clears the umia threshold/i)).toBeInTheDocument();
  });
});
