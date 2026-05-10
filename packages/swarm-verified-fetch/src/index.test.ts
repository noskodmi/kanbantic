import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bmtRoot,
  bytesToHex,
  hexToBytes,
  IntegrityError,
  SWARM_CHUNK_SIZE,
  verifiedFetch,
} from "./index.js";

/**
 * Canonical BMT chunk address for an empty payload.
 *
 * Per Swarm's chunk-addressing scheme:
 *   span        = 8 zero bytes (length 0, little-endian)
 *   padded_data = 4096 zero bytes
 *   bmt_root    = BMT(padded_data) — 7 levels of pairwise keccak256 over
 *                 128 segments of 32 zero bytes
 *   chunk_id    = keccak256(span || bmt_root)
 *
 * This value matches the chunk hash for the empty file as produced by the
 * Swarm reference implementation and `@ethersphere/bee-js` v8.x.
 */
const EMPTY_BMT_ROOT_HEX = "b34ca8c22b9e982354f9c7f50b470d66db428d880c8a904d5fe4ec9713171526";

/**
 * BMT root of the ASCII bytes of "hello" (5 bytes).
 *
 * Cross-verified against `@ethersphere/bee-js` v8.x `bmtHash` to ensure this
 * implementation produces the same chunk address Swarm itself would produce.
 */
const HELLO_BMT_ROOT_HEX = "a2322ed653c075c08a7847275537b74ba9f523c55341efe3df85565a78c6bb4a";

describe("bmtRoot", () => {
  it("computes a 32-byte root", () => {
    const root = bmtRoot(new Uint8Array(0));
    expect(root).toBeInstanceOf(Uint8Array);
    expect(root.length).toBe(32);
  });

  it("matches the canonical empty-payload BMT root", () => {
    const root = bmtRoot(new Uint8Array(0));
    expect(bytesToHex(root)).toBe(EMPTY_BMT_ROOT_HEX);
  });

  it("matches a fixed root for the ASCII bytes of 'hello'", () => {
    const bytes = new TextEncoder().encode("hello");
    const root = bmtRoot(bytes);
    expect(bytesToHex(root)).toBe(HELLO_BMT_ROOT_HEX);
  });

  it("is deterministic across calls", () => {
    const a = bmtRoot(new TextEncoder().encode("hello"));
    const b = bmtRoot(new TextEncoder().encode("hello"));
    expect(bytesToHex(a)).toBe(bytesToHex(b));
  });

  it("differs when input differs (sanity)", () => {
    const a = bmtRoot(new TextEncoder().encode("hello"));
    const b = bmtRoot(new TextEncoder().encode("world"));
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });

  it("throws an explicit error for multi-chunk payloads (> 4096 bytes)", () => {
    const big = new Uint8Array(SWARM_CHUNK_SIZE + 1);
    expect(() => bmtRoot(big)).toThrowError(/multi-chunk BMT not yet implemented/);
  });
});

describe("hex helpers", () => {
  it("round-trips bytesToHex / hexToBytes", () => {
    const original = new Uint8Array([0, 1, 16, 255, 128]);
    const round = hexToBytes(bytesToHex(original));
    expect(Array.from(round)).toEqual(Array.from(original));
  });

  it("hexToBytes accepts a 0x prefix", () => {
    const a = hexToBytes("deadbeef");
    const b = hexToBytes("0xdeadbeef");
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("hexToBytes rejects odd-length hex", () => {
    expect(() => hexToBytes("abc")).toThrowError(/odd length/);
  });
});

describe("verifiedFetch", () => {
  type FetchFn = typeof fetch;
  interface FetchHolder {
    fetch: FetchFn;
  }
  const holder = globalThis as unknown as FetchHolder;
  let fetchSpy: MockInstance<FetchFn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(holder, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns the bytes when the BMT root matches", async () => {
    const payload = new TextEncoder().encode("hello");
    const ref = HELLO_BMT_ROOT_HEX;

    fetchSpy.mockResolvedValueOnce(new Response(payload, { status: 200, statusText: "OK" }));

    const out = await verifiedFetch(ref, { gateway: "https://example.test/bzz/" });
    expect(Array.from(out)).toEqual(Array.from(payload));
    expect(fetchSpy).toHaveBeenCalledWith(`https://example.test/bzz/${ref}`, expect.any(Object));
  });

  it("accepts a 0x-prefixed reference", async () => {
    const payload = new TextEncoder().encode("hello");
    fetchSpy.mockResolvedValueOnce(new Response(payload, { status: 200, statusText: "OK" }));
    const out = await verifiedFetch(`0x${HELLO_BMT_ROOT_HEX}`, {
      gateway: "https://example.test/bzz/",
    });
    expect(Array.from(out)).toEqual(Array.from(payload));
  });

  it("throws IntegrityError when the BMT root does not match", async () => {
    const payload = new TextEncoder().encode("hello");
    // Reference of "world" — won't match payload.
    const wrongRef = bytesToHex(bmtRoot(new TextEncoder().encode("world")));

    fetchSpy.mockResolvedValueOnce(new Response(payload, { status: 200, statusText: "OK" }));

    let caught: unknown;
    try {
      await verifiedFetch(wrongRef, { gateway: "https://example.test/bzz/" });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(IntegrityError);
    const e = caught as IntegrityError;
    expect(e.expected).toBe(wrongRef);
    expect(e.actual).toBe(HELLO_BMT_ROOT_HEX);
    expect(e.message).toMatch(/Swarm integrity check failed/);
  });

  it("throws on non-OK HTTP responses", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 404, statusText: "Not Found" }));
    await expect(
      verifiedFetch(EMPTY_BMT_ROOT_HEX, { gateway: "https://example.test/bzz/" }),
    ).rejects.toThrowError(/HTTP 404/);
  });

  it("rejects non-hex references early (before fetching)", async () => {
    await expect(
      verifiedFetch("not-a-hex-string", { gateway: "https://example.test/bzz/" }),
    ).rejects.toThrowError(/non-hex/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propagates the multi-chunk error when the gateway returns > 4096 bytes", async () => {
    const big = new Uint8Array(SWARM_CHUNK_SIZE + 1);
    fetchSpy.mockResolvedValueOnce(new Response(big, { status: 200, statusText: "OK" }));
    await expect(
      verifiedFetch(EMPTY_BMT_ROOT_HEX, { gateway: "https://example.test/bzz/" }),
    ).rejects.toThrowError(/multi-chunk BMT not yet implemented/);
  });
});
