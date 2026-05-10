import { describe, expect, it } from "vitest";

import {
  deploymentFor,
  isOffchainResolverDeployed,
  sepoliaDeployment,
  UNDEPLOYED_PLACEHOLDER,
} from "./index.js";

describe("sepoliaDeployment", () => {
  it("has chainId 11155111", () => {
    expect(sepoliaDeployment.chainId).toBe(11155111);
  });

  it("has all 5 production contracts", () => {
    const c = sepoliaDeployment.contracts;
    expect(c.WorkspaceRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(c.AgentRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(c.BountyBoard).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(c.ReputationAttestor).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(c.ArbiterCouncil).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("has an AgentVenture entry (deployed + Sourcify-verified on Sepolia)", () => {
    expect(sepoliaDeployment.contracts.AgentVenture).not.toBe(UNDEPLOYED_PLACEHOLDER);
    expect(sepoliaDeployment.contracts.AgentVenture).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("has an OffchainResolver entry (deployed + Sourcify-verified on Sepolia)", () => {
    expect(sepoliaDeployment.contracts.OffchainResolver).not.toBe(UNDEPLOYED_PLACEHOLDER);
    expect(sepoliaDeployment.contracts.OffchainResolver).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("UNDEPLOYED_PLACEHOLDER is the zero address", () => {
    expect(UNDEPLOYED_PLACEHOLDER).toBe("0x0000000000000000000000000000000000000000");
  });

  it("pins the WorkspaceRegistry address", () => {
    expect(sepoliaDeployment.contracts.WorkspaceRegistry).toBe(
      "0x78CA5187217C5f10679A71E5De73CCdFBE3fB4B6",
    );
  });

  it("has the kanbantic.eth ENS metadata", () => {
    expect(sepoliaDeployment.ens.rootName).toBe("kanbantic.eth");
    expect(sepoliaDeployment.ens.rootNamehash).toBe(
      "0xb4c81d607382cd32c89297f9a8c9984b690260118843ad2961d043cb2ea948b7",
    );
  });
});

describe("isOffchainResolverDeployed", () => {
  it("is true now that the contract is live on Sepolia", () => {
    expect(isOffchainResolverDeployed).toBe(true);
  });
});

describe("deploymentFor", () => {
  it("returns sepolia deployment for chain 11155111", () => {
    expect(deploymentFor(11155111)).toBe(sepoliaDeployment);
  });

  it("throws for unsupported chain ids", () => {
    expect(() => deploymentFor(1)).toThrow(/No deployment for chain id 1/);
    expect(() => deploymentFor(8453)).toThrow();
  });
});
