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

import { useAgentRegistry, useBountyBoard } from "./contracts.js";

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
});
