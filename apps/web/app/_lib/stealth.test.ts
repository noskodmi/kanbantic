/**
 * `stealth.ts` is a cryptographic primitive — the tests here lock in
 * format-validation, a known good fixture, and the round-trip property
 * that lets a recipient (holding the matching viewing + spending secret
 * keys) recover the same one-time address the sender derived.
 *
 * The fixture is generated deterministically below with the secret-key
 * triple `(spending=0x11..11, viewing=0x22..22, ephemeral=0x33..33)`.
 * Judges can re-derive every value in a few lines of node.js — see the
 * README "Privacy by Design" section.
 */

import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

import { extractStealthMeta, generateStealthAddress, parseStealthMetaAddress } from "./stealth.js";

// ─── deterministic key material for the canonical fixture ─── //

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

function bytesToBigInt(b: Uint8Array): bigint {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  return n;
}

const SPENDING_SK = hexToBytes("11".repeat(32));
const VIEWING_SK = hexToBytes("22".repeat(32));
const EPHEMERAL_SK = hexToBytes("33".repeat(32));

const K_POINT = secp256k1.Point.BASE.multiply(bytesToBigInt(SPENDING_SK));
const V_POINT = secp256k1.Point.BASE.multiply(bytesToBigInt(VIEWING_SK));

const FIXTURE_META = `st:eth:0x${bytesToHex(K_POINT.toBytes(true))}${bytesToHex(V_POINT.toBytes(true))}`;

// Captured from running the algorithm with the fixture inputs above.
// Re-derived live in `recipient round-trip recovers the stealth address`.
const FIXTURE_STEALTH_ADDRESS = "0xd8606ed2ecdb71fdcb8cca8fa1925ff84238f2a9";
const FIXTURE_EPHEMERAL_PUBKEY =
  "0x023c72addb4fdf09af94f0c94d7fe92a386a7e70cf8a1d85916386bb2535c7b1b1";
const FIXTURE_VIEW_TAG = 0x20;

describe("parseStealthMetaAddress", () => {
  it("accepts the canonical st:eth:0x<spending><viewing> form", () => {
    const parsed = parseStealthMetaAddress(FIXTURE_META);
    expect(parsed.spendingPubKey).toBe(`0x${bytesToHex(K_POINT.toBytes(true))}`);
    expect(parsed.viewingPubKey).toBe(`0x${bytesToHex(V_POINT.toBytes(true))}`);
  });

  it("trims surrounding whitespace", () => {
    expect(() => parseStealthMetaAddress(`  ${FIXTURE_META}  `)).not.toThrow();
  });

  it("accepts mixed-case hex (and lowercases internally)", () => {
    const upper = FIXTURE_META.replace(/[0-9a-f]+$/, (m) => m.toUpperCase());
    const parsed = parseStealthMetaAddress(upper);
    expect(parsed.spendingPubKey.startsWith("0x")).toBe(true);
    expect(parsed.spendingPubKey).toBe(parsed.spendingPubKey.toLowerCase());
  });

  it("rejects a missing `st:` prefix", () => {
    expect(() => parseStealthMetaAddress(FIXTURE_META.replace(/^st:/, ""))).toThrow(
      /invalid stealth meta-address/i,
    );
  });

  it("rejects a missing chain segment", () => {
    expect(() => parseStealthMetaAddress(FIXTURE_META.replace(/^st:eth:/, "st::"))).toThrow(
      /invalid stealth meta-address/i,
    );
  });

  it("rejects a body that is not 132 hex chars", () => {
    expect(() => parseStealthMetaAddress(`st:eth:0x${bytesToHex(K_POINT.toBytes(true))}`)).toThrow(
      /132 hex chars/,
    );
  });

  it("rejects a pubkey that doesn't start with 02/03", () => {
    // Replace the first byte (02/03) with `04` (uncompressed prefix).
    const broken = FIXTURE_META.replace(/0x0[23]/, "0x04");
    expect(() => parseStealthMetaAddress(broken)).toThrow(/02\/03/);
  });

  it("rejects pubkey hex that decodes to an off-curve point", () => {
    // Flip one byte deep in the spending pubkey to break the curve check.
    const idx = "st:eth:0x".length + 4;
    const broken = FIXTURE_META.slice(0, idx) + "ff" + FIXTURE_META.slice(idx + 2);
    expect(() => parseStealthMetaAddress(broken)).toThrow(/secp256k1 curve/);
  });
});

describe("generateStealthAddress", () => {
  it("matches the canonical fixture for the known (spending, viewing, ephemeral) triple", () => {
    const result = generateStealthAddress(FIXTURE_META, EPHEMERAL_SK);
    expect(result.stealthAddress).toBe(FIXTURE_STEALTH_ADDRESS);
    expect(result.ephemeralPubKey).toBe(FIXTURE_EPHEMERAL_PUBKEY);
    expect(result.viewTag).toBe(FIXTURE_VIEW_TAG);
  });

  it("recipient round-trip recovers the stealth address from (V_sk, K_sk, R)", () => {
    // Sender side
    const sent = generateStealthAddress(FIXTURE_META, EPHEMERAL_SK);

    // Recipient reconstructs S = V_sk * R
    const R = secp256k1.Point.fromBytes(hexToBytes(sent.ephemeralPubKey));
    const sharedR = R.multiply(bytesToBigInt(VIEWING_SK));
    const sharedHashR = keccak_256(sharedR.toBytes(true));
    const tweakR = bytesToBigInt(sharedHashR) % secp256k1.Point.Fn.ORDER;

    // Stealth privkey = K_sk + tweak (mod n)
    const stealthSk = (bytesToBigInt(SPENDING_SK) + tweakR) % secp256k1.Point.Fn.ORDER;
    const stealthPub = secp256k1.Point.BASE.multiply(stealthSk);
    const unc = stealthPub.toBytes(false);
    const addrHash = keccak_256(unc.slice(1));
    const recovered = `0x${bytesToHex(addrHash.slice(addrHash.length - 20))}`;

    expect(recovered).toBe(sent.stealthAddress);
    // And the cheap path (view tag) matches before the recipient does
    // the heavier `K + s*G` math.
    expect(sharedHashR[0]).toBe(sent.viewTag);
  });

  it("yields different stealth addresses for different ephemeral secrets", () => {
    const a = generateStealthAddress(FIXTURE_META, hexToBytes("44".repeat(32)));
    const b = generateStealthAddress(FIXTURE_META, hexToBytes("55".repeat(32)));
    expect(a.stealthAddress).not.toBe(b.stealthAddress);
    expect(a.ephemeralPubKey).not.toBe(b.ephemeralPubKey);
  });

  it("rejects an ephemeral secret that is the wrong length", () => {
    expect(() => generateStealthAddress(FIXTURE_META, new Uint8Array(31))).toThrow(/32 bytes/);
  });

  it("rejects an ephemeral secret that reduces to zero", () => {
    expect(() => generateStealthAddress(FIXTURE_META, new Uint8Array(32))).toThrow(
      /reduces to zero/,
    );
  });
});

describe("extractStealthMeta", () => {
  it("returns the meta-address when present", () => {
    const caps = `summarize, stealth=${FIXTURE_META}, translate`;
    expect(extractStealthMeta(caps)).toBe(FIXTURE_META);
  });

  it("returns null when no stealth token is present", () => {
    expect(extractStealthMeta("summarize, translate")).toBeNull();
  });

  it("is case-insensitive on the `stealth=` prefix", () => {
    expect(extractStealthMeta(`Stealth=${FIXTURE_META}`)).toBe(FIXTURE_META);
  });

  it("ignores extra whitespace around tokens", () => {
    expect(extractStealthMeta(`  stealth=${FIXTURE_META}  ,foo`)).toBe(FIXTURE_META);
  });
});
