import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sepoliaDeployment } from "@kanbantic/shared";

const ENDPOINT = "https://example.com/api/contract-intelligence/run";

const AGENT_REGISTRY = sepoliaDeployment.contracts.AgentRegistry;
const TINY_AGENT_REGISTRY_SOL = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    mapping(bytes32 => address) public ownerOf;
    function register(bytes32 node, address owner) external {
        ownerOf[node] = owner;
    }
}
`;

function sourcifyV2Response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isSourcifyV2Url(url: string): boolean {
  return url.startsWith("https://sourcify.dev/server/v2/contract/");
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe("POST /api/contract-intelligence/run", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("audits an exact_match Sepolia contract and returns a report quoting the source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request): Promise<Response> => {
        const url = urlOf(input);
        if (isSourcifyV2Url(url)) {
          return Promise.resolve(
            sourcifyV2Response({
              match: "exact_match",
              creationMatch: "exact_match",
              runtimeMatch: "exact_match",
              sources: {
                "src/AgentRegistry.sol": { content: TINY_AGENT_REGISTRY_SOL },
              },
            }),
          );
        }
        throw new Error(`unexpected fetch in test: ${url}`);
      }),
    );

    const response = await SELF.fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskKind: "audit", address: AGENT_REGISTRY }),
    });

    expect(response.status).toBe(200);
    const body = await response.json<{
      kind: string;
      address: string;
      sourcifyMatch: string;
      report: string;
      sourcifyUrl: string;
    }>();
    expect(body.kind).toBe("audit");
    expect(body.address).toBe(AGENT_REGISTRY);
    expect(body.sourcifyMatch).toBe("exact_match");
    expect(body.sourcifyUrl).toBe(`https://sourcify.dev/lookup/${AGENT_REGISTRY}`);
    // Stubbed report must include the verified source preview so judges
    // see the Sourcify pipeline is real.
    expect(body.report).toContain("contract AgentRegistry");
    expect(body.report).toContain("## Findings (stub)");
    expect(body.report).toContain("AI_GATEWAY_TOKEN");
  });

  it("explains a partial_match contract with a 3-paragraph stub", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request): Promise<Response> => {
        const url = urlOf(input);
        if (isSourcifyV2Url(url)) {
          return Promise.resolve(
            sourcifyV2Response({
              match: "match",
              sources: { "X.sol": { content: "contract X {}" } },
            }),
          );
        }
        throw new Error(`unexpected fetch in test: ${url}`);
      }),
    );

    const response = await SELF.fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskKind: "explain", address: AGENT_REGISTRY }),
    });

    expect(response.status).toBe(200);
    const body = await response.json<{ sourcifyMatch: string; report: string }>();
    expect(body.sourcifyMatch).toBe("partial_match");
    expect(body.report).toContain("## Explanation (stub)");
  });

  it("returns a not_verified envelope when Sourcify has no match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request): Promise<Response> => {
        const url = urlOf(input);
        if (isSourcifyV2Url(url)) {
          return Promise.resolve(
            sourcifyV2Response({ match: null, creationMatch: null, runtimeMatch: null }, 404),
          );
        }
        throw new Error(`unexpected fetch in test: ${url}`);
      }),
    );

    const response = await SELF.fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskKind: "audit",
        address: "0xdEAD000000000000000000000000000000000000",
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json<{ error: string; message: string }>();
    expect(body.error).toBe("not_verified");
    expect(body.message).toMatch(/not verified on Sourcify/i);
  });

  it("short-circuits similarity with a not_implemented_v01 envelope", async () => {
    // No fetch stub — handler must NOT call Sourcify for similarity.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("similarity must not call Sourcify in v0.1");
      }),
    );

    const response = await SELF.fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskKind: "similarity", address: AGENT_REGISTRY }),
    });

    expect(response.status).toBe(200);
    const body = await response.json<{ error: string; message: string }>();
    expect(body.error).toBe("not_implemented_v01");
    expect(body.message).toMatch(/v0\.2/);
  });

  it("rejects an invalid taskKind with 400", async () => {
    const response = await SELF.fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskKind: "bogus", address: AGENT_REGISTRY }),
    });
    expect(response.status).toBe(400);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("invalid_request");
  });

  it("rejects an invalid address with 400", async () => {
    const response = await SELF.fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskKind: "audit", address: "not-an-address" }),
    });
    expect(response.status).toBe(400);
    const body = await response.json<{ error: string }>();
    expect(body.error).toBe("invalid_request");
  });
});
