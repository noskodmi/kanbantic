import { describe, expect, it } from "vitest";
import type { AgentSummary, BountySummary } from "@kanbantic/shared";

import {
  filterByClaimer,
  filterByOwner,
  filterByPoster,
  filterContractIntelligence,
  filterDisputesForCouncil,
  isZeroAddress,
  sumSettledRewardsForAgent,
} from "./filters.js";

const AGENT_NODE_A = "0xAAAA000000000000000000000000000000000000000000000000000000000001";
const AGENT_NODE_B = "0xBBBB000000000000000000000000000000000000000000000000000000000002";

const COUNCIL = "0x8B491130cc3Be0991824e4e6411B66B3066256c7";
const OWNER_A = "0x44C176989D16f5C2A846cf59d4Cf68Af1006dDdE";
const OWNER_B = "0x1111111111111111111111111111111111111111";

function mockAgent(overrides: Partial<AgentSummary>): AgentSummary {
  return {
    node: AGENT_NODE_A,
    parent: "0xb4c81d607382cd32c89297f9a8c9984b690260118843ad2961d043cb2ea948b7",
    owner: OWNER_A,
    label: "alpha",
    mcp_endpoint: "https://example.com/mcp",
    capabilities: "research",
    profile_ref: null,
    registered_at_block: 1,
    registered_at_ts: 1700000000,
    reputation_score: 4.5,
    reputation_count: 3,
    ...overrides,
  };
}

function mockBounty(overrides: Partial<BountySummary>): BountySummary {
  return {
    id: "1",
    poster: OWNER_B,
    capability: "research",
    reward: "1000000000000000000",
    description_ref: "0xdeadbeef",
    expires_at: 0,
    claim_window_blocks: 0,
    status: "Open",
    claimer_node: null,
    claimer_address: null,
    workspace_node: "0x0000000000000000000000000000000000000000000000000000000000000000",
    arbiter_council: COUNCIL,
    created_at_block: 1,
    created_at_ts: 1700000000,
    resolved_at_block: null,
    ...overrides,
  };
}

describe("dashboard filter helpers", () => {
  it("filterByOwner matches case-insensitively", () => {
    const agents = [
      mockAgent({ owner: OWNER_A.toLowerCase() }),
      mockAgent({ node: AGENT_NODE_B, label: "beta", owner: OWNER_B }),
    ];
    expect(filterByOwner(agents, OWNER_A.toUpperCase())).toHaveLength(1);
    expect(filterByOwner(agents, OWNER_A.toUpperCase())[0]?.label).toBe("alpha");
  });

  it("filterByOwner returns [] when no address is supplied", () => {
    expect(filterByOwner([mockAgent({})], "")).toEqual([]);
  });

  it("filterByPoster matches case-insensitively", () => {
    const bounties = [
      mockBounty({ id: "1", poster: OWNER_A.toLowerCase() }),
      mockBounty({ id: "2", poster: OWNER_B }),
    ];
    expect(filterByPoster(bounties, OWNER_A)).toHaveLength(1);
    expect(filterByPoster(bounties, OWNER_A)[0]?.id).toBe("1");
  });

  it("filterByClaimer ignores null claimer_node entries", () => {
    const bounties = [
      mockBounty({ id: "1", claimer_node: AGENT_NODE_A }),
      mockBounty({ id: "2", claimer_node: null }),
    ];
    expect(filterByClaimer(bounties, AGENT_NODE_A)).toHaveLength(1);
  });

  it("sumSettledRewardsForAgent sums Resolved bounties only", () => {
    const bounties = [
      mockBounty({
        id: "1",
        claimer_node: AGENT_NODE_A,
        status: "Resolved",
        reward: "1000000000000000000",
      }),
      mockBounty({
        id: "2",
        claimer_node: AGENT_NODE_A,
        status: "Resolved",
        reward: "500000000000000000",
      }),
      mockBounty({
        id: "3",
        claimer_node: AGENT_NODE_A,
        status: "Claimed",
        reward: "9999999999999999999",
      }),
      mockBounty({ id: "4", claimer_node: AGENT_NODE_B, status: "Resolved", reward: "1" }),
    ];
    expect(sumSettledRewardsForAgent(bounties, AGENT_NODE_A)).toBe(1_500_000_000_000_000_000n);
  });

  it("sumSettledRewardsForAgent skips malformed reward strings without throwing", () => {
    const bounties = [
      mockBounty({ claimer_node: AGENT_NODE_A, status: "Resolved", reward: "not-a-number" }),
      mockBounty({
        id: "2",
        claimer_node: AGENT_NODE_A,
        status: "Resolved",
        reward: "1000000000000000000",
      }),
    ];
    expect(sumSettledRewardsForAgent(bounties, AGENT_NODE_A)).toBe(1_000_000_000_000_000_000n);
  });

  it("filterDisputesForCouncil only returns Disputed status + matching council", () => {
    const otherCouncil = "0x9999999999999999999999999999999999999999";
    const bounties = [
      mockBounty({ id: "1", status: "Disputed", arbiter_council: COUNCIL }),
      mockBounty({ id: "2", status: "Disputed", arbiter_council: otherCouncil }),
      mockBounty({ id: "3", status: "Open", arbiter_council: COUNCIL }),
    ];
    const result = filterDisputesForCouncil(bounties, COUNCIL);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("1");
  });

  it("filterContractIntelligence matches audit/explain/similarity case-insensitively", () => {
    const bounties = [
      mockBounty({ id: "1", capability: "audit" }),
      mockBounty({ id: "2", capability: "Explain" }),
      mockBounty({ id: "3", capability: "SIMILARITY" }),
      mockBounty({ id: "4", capability: "research" }),
    ];
    const result = filterContractIntelligence(bounties);
    expect(result.map((b) => b.id)).toEqual(["1", "2", "3"]);
  });

  it("isZeroAddress recognises the canonical zero address", () => {
    expect(isZeroAddress("0x0000000000000000000000000000000000000000")).toBe(true);
    expect(isZeroAddress("0x0000000000000000000000000000000000000001")).toBe(false);
    expect(isZeroAddress(null)).toBe(false);
  });
});
