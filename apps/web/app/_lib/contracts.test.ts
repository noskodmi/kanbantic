import { describe, expect, it, vi } from "vitest";

vi.mock("wagmi", () => ({
  useWriteContract: vi.fn(() => ({
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
    reset: vi.fn(),
  })),
}));

import {
  isAgentVentureDeployed,
  useAgentRegistry,
  useAgentVenture,
  useBountyBoard,
  useWorkspaceRegistry,
} from "./contracts.js";

describe("contract write helpers", () => {
  it("useAgentRegistry exposes the four AgentRegistry write methods", () => {
    const helper = useAgentRegistry();
    expect(typeof helper.register).toBe("function");
    expect(typeof helper.update).toBe("function");
    expect(typeof helper.transferOwner).toBe("function");
    expect(typeof helper.setProfileRef).toBe("function");
    expect(typeof helper.reset).toBe("function");
    expect(helper.isPending).toBe(false);
    expect(helper.error).toBeNull();
    expect(helper.hash).toBeUndefined();
  });

  it("useBountyBoard exposes the seven BountyBoard write methods", () => {
    const helper = useBountyBoard();
    expect(typeof helper.post).toBe("function");
    expect(typeof helper.claim).toBe("function");
    expect(typeof helper.commitClaim).toBe("function");
    expect(typeof helper.finalizeFairClaim).toBe("function");
    expect(typeof helper.submit).toBe("function");
    expect(typeof helper.accept).toBe("function");
    expect(typeof helper.reject).toBe("function");
    expect(typeof helper.reset).toBe("function");
    expect(helper.isPending).toBe(false);
    expect(helper.error).toBeNull();
    expect(helper.hash).toBeUndefined();
  });

  it("useWorkspaceRegistry exposes the four WorkspaceRegistry write methods", () => {
    const helper = useWorkspaceRegistry();
    expect(typeof helper.create).toBe("function");
    expect(typeof helper.addMember).toBe("function");
    expect(typeof helper.removeMember).toBe("function");
    expect(typeof helper.transferAdmin).toBe("function");
    expect(typeof helper.reset).toBe("function");
    expect(helper.isPending).toBe(false);
    expect(helper.error).toBeNull();
    expect(helper.hash).toBeUndefined();
  });

  it("useAgentVenture exposes mint + isDeployed + address", () => {
    const helper = useAgentVenture();
    expect(typeof helper.mint).toBe("function");
    expect(typeof helper.reset).toBe("function");
    expect(typeof helper.isDeployed).toBe("boolean");
    expect(helper.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(helper.isPending).toBe(false);
    expect(helper.error).toBeNull();
    expect(helper.hash).toBeUndefined();
  });

  it("isAgentVentureDeployed is true now that the contract is live on Sepolia", () => {
    expect(isAgentVentureDeployed).toBe(true);
  });
});
