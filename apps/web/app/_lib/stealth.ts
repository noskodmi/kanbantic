/**
 * EIP-5564 stealth-address derivation helpers (secp256k1).
 *
 * Spec: https://eips.ethereum.org/EIPS/eip-5564
 *
 * These are pure functions: no React, no wagmi, no DOM. Both the unit
 * tests and the `/work/[id]` settle hint pull from this module so the
 * cryptographic primitive is exercised end-to-end client-side.
 *
 * ## What the algorithm does (short version)
 *
 *   The recipient (claimer) publishes a stealth meta-address:
 *     `K || V`  — two compressed (33-byte) secp256k1 public keys:
 *       * `K`  spending public key
 *       * `V`  viewing public key
 *
 *   The sender (poster) wants to pay an address only the recipient can
 *   spend from:
 *
 *     1. Generate ephemeral private key `r in [1, n-1]`.
 *        Publish `R = r*G` (compressed, 33 bytes).
 *     2. Compute shared secret `S = r*V`. Hash its compressed form
 *        with keccak-256 to get a 32-byte tweak `s = keccak(S_c)`.
 *     3. View tag = the first byte of `s`. The recipient scans
 *        only one byte per ephemeral pubkey before deciding whether
 *        to do the heavier `K + s*G` math.
 *     4. Stealth public key `P = K + s*G`. The Ethereum address is
 *        the last 20 bytes of `keccak256(uncompressed(P) without the
 *        0x04 prefix)` — same encoding as ordinary EOA derivation.
 *
 * v0.1 ships derivation only — actually paying to the stealth address
 * requires `BountyBoard.accept(...)` to take a payout-address argument,
 * which is a v0.2 contract change. See README "Privacy by Design".
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import type { Hex } from "viem";

/** Length of a compressed secp256k1 public key. */
const COMPRESSED_PUBKEY_BYTES = 33;
/** Two compressed pubkeys = 66 bytes = 132 hex chars (no `0x`). */
const META_HEX_BODY_LENGTH = COMPRESSED_PUBKEY_BYTES * 2 * 2;

/** Curve order; valid scalars are in `[1, n-1]`. */
const SECP256K1_N: bigint = secp256k1.Point.Fn.ORDER;

/**
 * The EIP-5564 prefix for ETH-mainnet meta-addresses. Lowercased to
 * match user input. The spec also allows chain-scoped variants
 * (`st:<chain>:0x...`) — for v0.1 we accept any prefix of the form
 * `st:<word>:0x...` so testers aren't blocked on chain-id pedantry.
 */
const META_PREFIX_RE = /^st:[a-z0-9]+:0x([0-9a-f]+)$/i;

export interface StealthMetaAddress {
  /** Spending public key, compressed (33 bytes, hex). */
  spendingPubKey: Hex;
  /** Viewing public key, compressed (33 bytes, hex). */
  viewingPubKey: Hex;
}

export interface StealthAddressResult {
  /** Derived one-time payout address (20-byte Ethereum address). */
  stealthAddress: Hex;
  /** Ephemeral public key the sender publishes alongside the tx (33 bytes). */
  ephemeralPubKey: Hex;
  /** First byte of the shared-secret hash; lets the recipient scan cheaply. */
  viewTag: number;
}

/**
 * Parse `st:eth:0x<spending><viewing>` into its two compressed pubkeys.
 *
 * Throws `Error("invalid stealth meta-address: ...")` for any deviation
 * from the EIP-5564 format. Callers can `try { ... } catch` to surface
 * the message back to the user inline.
 */
export function parseStealthMetaAddress(meta: string): StealthMetaAddress {
  const match = META_PREFIX_RE.exec(meta.trim());
  if (match === null) {
    throw new Error(
      "invalid stealth meta-address: expected `st:<chain>:0x<spending><viewing>` form",
    );
  }

  const body = match[1];
  if (body?.length !== META_HEX_BODY_LENGTH) {
    throw new Error(
      `invalid stealth meta-address: body must be ${String(META_HEX_BODY_LENGTH)} hex chars (got ${String(body?.length ?? 0)})`,
    );
  }

  const spendingHex = body.slice(0, COMPRESSED_PUBKEY_BYTES * 2);
  const viewingHex = body.slice(COMPRESSED_PUBKEY_BYTES * 2);

  // Each must decode to a valid compressed secp256k1 point. If either
  // side is bunk we want to fail here, not deep inside `generate...`.
  assertValidCompressedPubKey(spendingHex, "spending");
  assertValidCompressedPubKey(viewingHex, "viewing");

  return {
    spendingPubKey: `0x${spendingHex.toLowerCase()}`,
    viewingPubKey: `0x${viewingHex.toLowerCase()}`,
  };
}

function assertValidCompressedPubKey(hex: string, role: "spending" | "viewing"): void {
  if (!/^0[23][0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      `invalid stealth meta-address: ${role} pubkey must start with 02/03 and be 33 bytes`,
    );
  }
  try {
    secp256k1.Point.fromBytes(hexToBytes(hex));
  } catch (cause) {
    throw new Error(`invalid stealth meta-address: ${role} pubkey is not on the secp256k1 curve`, {
      cause,
    });
  }
}

/**
 * Generate a one-time stealth address for `meta`.
 *
 * `ephemeralSecret` is normally generated from `crypto.getRandomValues`;
 * tests pass it explicitly so the derivation is deterministic. When
 * omitted we draw 32 fresh bytes from the platform CSPRNG.
 */
export function generateStealthAddress(
  meta: string,
  ephemeralSecret?: Uint8Array,
): StealthAddressResult {
  const { spendingPubKey, viewingPubKey } = parseStealthMetaAddress(meta);

  const r = normalizeEphemeralSecret(ephemeralSecret);
  const ephemeralPoint = secp256k1.Point.BASE.multiply(r);
  const ephemeralPubKey = ephemeralPoint.toBytes(true);

  // Shared secret S = r*V (point), serialized compressed.
  const V = secp256k1.Point.fromBytes(hexToBytes(stripHex(viewingPubKey)));
  const sharedPoint = V.multiply(r);
  const sharedHash = keccak_256(sharedPoint.toBytes(true));

  const tweak = bytesToBigInt(sharedHash) % SECP256K1_N;
  if (tweak === 0n) {
    // Astronomically unlikely; the spec says reject.
    throw new Error("stealth derivation produced a zero scalar; retry with new ephemeral key");
  }

  // P_stealth = K + s*G
  const K = secp256k1.Point.fromBytes(hexToBytes(stripHex(spendingPubKey)));
  const stealthPoint = K.add(secp256k1.Point.BASE.multiply(tweak));

  // Ethereum address = last 20 bytes of keccak(uncompressed(P) without 0x04 prefix).
  const uncompressed = stealthPoint.toBytes(false); // 65 bytes: 0x04 || X || Y
  const addrHash = keccak_256(uncompressed.slice(1));
  const address = bytesToHex(addrHash.slice(addrHash.length - 20));

  const viewTag = sharedHash[0] ?? 0;

  return {
    stealthAddress: `0x${address}`,
    ephemeralPubKey: `0x${bytesToHex(ephemeralPubKey)}`,
    viewTag,
  };
}

/**
 * Pull `stealth=<meta>` out of an agent's comma-separated `capabilities`
 * string. Returns `null` if the agent hasn't opted in.
 *
 * The token shape is intentionally narrow so the surrounding `capabilities`
 * UX (chips, filters) keeps working unchanged — the stealth meta-address
 * just rides along as one more capability tag.
 */
export function extractStealthMeta(capabilities: string): string | null {
  const tokens = capabilities.split(",").map((t) => t.trim());
  for (const token of tokens) {
    if (token.toLowerCase().startsWith("stealth=")) {
      return token.slice("stealth=".length).trim();
    }
  }
  return null;
}

// internals

function normalizeEphemeralSecret(input: Uint8Array | undefined): bigint {
  const bytes = input ?? randomScalarBytes();
  if (bytes.length !== 32) {
    throw new Error("ephemeral secret must be 32 bytes");
  }
  const value = bytesToBigInt(bytes) % SECP256K1_N;
  if (value === 0n) {
    throw new Error("ephemeral secret reduces to zero modulo curve order");
  }
  return value;
}

function randomScalarBytes(): Uint8Array {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

function stripHex(hex: Hex): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = stripHex(hex as Hex);
  if (clean.length % 2 !== 0) {
    throw new Error("hex string has odd length");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`invalid hex byte at index ${String(i)}`);
    }
    out[i] = byte;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) {
    n = (n << 8n) | BigInt(b);
  }
  return n;
}
