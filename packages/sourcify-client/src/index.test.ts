import { afterEach, describe, expect, it, vi } from "vitest";

import { lookup } from "./index.js";

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("lookup()", () => {
  it("hits the Sourcify v2 contract endpoint with chainId + address + fields=all", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        match: "exact_match",
        sources: { "Storage.sol": { content: "contract Storage {}" } },
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await lookup(11155111, "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      "https://sourcify.dev/server/v2/contract/11155111/0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa?fields=all",
    );
  });

  it("parses an exact_match v2 response and flattens sources", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        match: "exact_match",
        creationMatch: "exact_match",
        runtimeMatch: "exact_match",
        metadata: { compiler: { version: "0.8.24+commit.e11b9ed9" }, language: "Solidity" },
        sources: {
          "contracts/Storage.sol": { content: "contract Storage { uint256 x; }" },
          "contracts/Owner.sol": { content: "contract Owner {}" },
        },
      }),
    ) as typeof fetch;

    const result = await lookup(11155111, "0x0Ec3f4dfd9D303Fa5d834aC2ff39e534D1A2Ecf3");

    expect(result.match).toBe("exact_match");
    expect(result.metadata?.compiler?.version).toBe("0.8.24+commit.e11b9ed9");
    expect(result.sources).toEqual({
      "contracts/Storage.sol": "contract Storage { uint256 x; }",
      "contracts/Owner.sol": "contract Owner {}",
    });
  });

  it('maps Sourcify v2 "match" to "partial_match" for downstream consumers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        match: "match",
        sources: { "A.sol": { content: "contract A {}" } },
      }),
    ) as typeof fetch;

    const result = await lookup(11155111, "0x1111111111111111111111111111111111111111");
    expect(result.match).toBe("partial_match");
  });

  it("returns { match: 'none' } when the contract is not verified (404)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          match: null,
          creationMatch: null,
          runtimeMatch: null,
          chainId: "11155111",
          address: "0xDFEBAd708F803af22e81044aD228Ff77C83C935c",
        },
        { status: 404 },
      ),
    ) as typeof fetch;

    const result = await lookup(11155111, "0xDFEBAd708F803af22e81044aD228Ff77C83C935c");
    expect(result).toEqual({ match: "none" });
  });

  it("returns { match: 'none' } when the API responds 200 but match is null", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ match: null, creationMatch: null, runtimeMatch: null }),
      ) as typeof fetch;

    const result = await lookup(11155111, "0x2222222222222222222222222222222222222222");
    expect(result).toEqual({ match: "none" });
  });

  it("throws on unexpected non-ok responses (5xx)", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("upstream boom", { status: 503, statusText: "Service Unavailable" }),
      ) as typeof fetch;

    await expect(lookup(11155111, "0x3333333333333333333333333333333333333333")).rejects.toThrow(
      /sourcify v2 lookup failed: 503/,
    );
  });
});
