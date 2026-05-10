/**
 * Sign-In With Ethereum (EIP-4361) for the Cloudflare worker.
 *
 * Three surfaces are exported:
 *
 *   POST /api/siwe/nonce   → siweNonceHandler
 *   POST /api/siwe/verify  → siweVerifyHandler
 *   requireSiwe(req, env)  → guard for write endpoints
 *
 * The nonce is a 16-byte URL-safe random string persisted to D1
 * (`siwe_nonces`) with a 5-minute TTL. The client renders an EIP-4361
 * message that includes the nonce, signs it with the connected wallet,
 * and POSTs `{ message, signature }` back. The verify handler:
 *
 *   1. Parses the EIP-4361 message and pulls out `address`, `nonce`,
 *      `domain`, `chainId`, `issuedAt`, optional `expirationTime`.
 *   2. Looks up the nonce in D1; rejects unknown / expired / used.
 *   3. Validates `domain` against `env.SIWE_DOMAIN` (or the request
 *      host as a fallback for preview deploys).
 *   4. Calls `viem.verifyMessage` to recover the signer and compare to
 *      the stated address.
 *   5. Marks the nonce used and issues a session token.
 *
 * The session token is a tiny custom JWT-ish format:
 *
 *   <base64url-header>.<base64url-payload>.<base64url-hmac-sha256>
 *
 * Header is fixed `{"alg":"HS256","typ":"SIWE"}`. Payload is
 * `{"sub":"0x…lowercased","iat":…,"exp":…}`. HMAC is computed over
 * `header.payload` with `env.SIWE_HMAC_SECRET`. 24-hour expiry.
 *
 * `requireSiwe()` reads the `Authorization: Bearer <token>` header,
 * verifies the HMAC, checks `exp`, and returns the decoded address. It
 * throws `SiweAuthError` on any failure; callers should catch and
 * return the carried HTTP status / body envelope.
 */

import { type Address, getAddress, verifyMessage } from "viem";

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";

const NONCE_BYTES = 16;
const NONCE_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const TOKEN_HEADER = { alg: "HS256", typ: "SIWE" } as const;

interface SiwePayload {
  sub: string;
  iat: number;
  exp: number;
}

interface SiweVerifyBody {
  message: string;
  signature: string;
}

/**
 * Thrown by SIWE helpers and the `requireSiwe()` guard. The HTTP
 * caller should `catch` and return `Response.json(body, { status })`.
 */
export class SiweAuthError extends Error {
  override readonly name = "SiweAuthError";
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  toResponse(): Response {
    return Response.json({ error: this.code, message: this.message }, { status: this.status });
  }
}

function siweMisconfigured(): SiweAuthError {
  return new SiweAuthError(
    503,
    "siwe_disabled",
    "SIWE auth is not configured on this worker. Set SIWE_HMAC_SECRET via wrangler secret put.",
  );
}

/** Cryptographically random nonce, base64url, ~22 chars. */
function generateNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // btoa is available in workerd.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeString(input: string): string {
  return base64UrlEncode(new TextEncoder().encode(input));
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function signSessionToken(secret: string, payload: SiwePayload): Promise<string> {
  const headerEncoded = base64UrlEncodeString(JSON.stringify(TOKEN_HEADER));
  const payloadEncoded = base64UrlEncodeString(JSON.stringify(payload));
  const signature = await hmacSign(secret, `${headerEncoded}.${payloadEncoded}`);
  return `${headerEncoded}.${payloadEncoded}.${base64UrlEncode(signature)}`;
}

async function verifySessionToken(secret: string, token: string): Promise<SiwePayload> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new SiweAuthError(401, "invalid_token", "Session token is malformed.");
  }
  const [headerEncoded, payloadEncoded, signatureEncoded] = parts as [string, string, string];
  const expected = await hmacSign(secret, `${headerEncoded}.${payloadEncoded}`);
  let provided: Uint8Array;
  try {
    provided = base64UrlDecode(signatureEncoded);
  } catch {
    throw new SiweAuthError(401, "invalid_token", "Session token signature is not base64url.");
  }
  if (!constantTimeEqual(expected, provided)) {
    throw new SiweAuthError(401, "invalid_token", "Session token signature does not verify.");
  }

  let payload: SiwePayload;
  try {
    const decoded = new TextDecoder().decode(base64UrlDecode(payloadEncoded));
    payload = JSON.parse(decoded) as SiwePayload;
  } catch {
    throw new SiweAuthError(401, "invalid_token", "Session token payload is not valid JSON.");
  }

  if (
    typeof payload.sub !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    throw new SiweAuthError(401, "invalid_token", "Session token payload is missing fields.");
  }

  if (Math.floor(Date.now() / 1000) >= payload.exp) {
    throw new SiweAuthError(401, "expired_token", "Session token is expired. Sign in again.");
  }

  return payload;
}

/**
 * Parse the load-bearing fields out of an EIP-4361 message. The format
 * is rigid (line-prefixed, fixed ordering) so a hand-rolled parser is
 * adequate; we don't need to support every optional field — only the
 * ones the worker enforces.
 */
interface ParsedSiweMessage {
  domain: string;
  address: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string | null;
  uri: string;
  version: string;
}

function parseSiweMessage(message: string): ParsedSiweMessage {
  const lines = message.split("\n");
  const firstLine = lines[0];
  if (!firstLine?.endsWith(" wants you to sign in with your Ethereum account:")) {
    throw new SiweAuthError(400, "invalid_message", "Message is not a valid EIP-4361 statement.");
  }
  const domain = firstLine
    .slice(0, firstLine.length - " wants you to sign in with your Ethereum account:".length)
    .trim();
  const addressLine = lines[1];
  if (addressLine === undefined || !/^0x[a-fA-F0-9]{40}$/.test(addressLine.trim())) {
    throw new SiweAuthError(400, "invalid_message", "Message is missing the address line.");
  }
  const address = addressLine.trim();

  const findField = (label: string): string | null => {
    const prefix = `${label}: `;
    for (const line of lines) {
      if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
    }
    return null;
  };

  const uri = findField("URI");
  const version = findField("Version");
  const chainIdRaw = findField("Chain ID");
  const nonce = findField("Nonce");
  const issuedAt = findField("Issued At");
  const expirationTime = findField("Expiration Time");

  if (
    uri === null ||
    version === null ||
    chainIdRaw === null ||
    nonce === null ||
    issuedAt === null
  ) {
    throw new SiweAuthError(400, "invalid_message", "Message is missing required EIP-4361 fields.");
  }
  const chainId = Number.parseInt(chainIdRaw, 10);
  if (!Number.isFinite(chainId)) {
    throw new SiweAuthError(400, "invalid_message", "Chain ID is not a valid integer.");
  }
  return { domain, address, chainId, nonce, issuedAt, expirationTime, uri, version };
}

/** POST /api/siwe/nonce — issue a single-use nonce. */
export async function siweNonceHandler(_request: Request, env: Env): Promise<Response> {
  if (!env.SIWE_HMAC_SECRET) {
    return siweMisconfigured().toResponse();
  }
  await applyMigrations(env.DB);
  const nonce = generateNonce();
  const issuedAt = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO siwe_nonces (nonce, address, issued_at, used) VALUES (?, NULL, ?, 0)",
  )
    .bind(nonce, issuedAt)
    .run();
  return Response.json({ nonce });
}

/** POST /api/siwe/verify — exchange a signed message for a session token. */
export async function siweVerifyHandler(request: Request, env: Env): Promise<Response> {
  if (!env.SIWE_HMAC_SECRET) {
    return siweMisconfigured().toResponse();
  }
  await applyMigrations(env.DB);

  let body: SiweVerifyBody;
  try {
    body = await request.json<SiweVerifyBody>();
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Body must be valid JSON." },
      { status: 400 },
    );
  }
  if (
    typeof body.message !== "string" ||
    typeof body.signature !== "string" ||
    !body.signature.startsWith("0x")
  ) {
    return Response.json(
      { error: "invalid_request", message: "Body must be { message: string, signature: '0x…' }." },
      { status: 400 },
    );
  }

  let parsed: ParsedSiweMessage;
  try {
    parsed = parseSiweMessage(body.message);
  } catch (err) {
    if (err instanceof SiweAuthError) return err.toResponse();
    throw err;
  }

  const expectedDomain = (env.SIWE_DOMAIN ?? new URL(request.url).host).toLowerCase();
  if (parsed.domain.toLowerCase() !== expectedDomain) {
    return new SiweAuthError(
      400,
      "wrong_domain",
      `Message domain ${parsed.domain} does not match worker domain ${expectedDomain}.`,
    ).toResponse();
  }

  // Reject deliberately-malformed `Expiration Time` (NaN). EIP-4361 says
  // expirationTime is OPTIONAL; if it's present we require it to parse.
  // Without this check, a client could submit `Expiration Time: garbage`
  // and bypass any expiry the field was supposed to declare.
  let messageExpiresAtMs: number | null = null;
  if (parsed.expirationTime !== null) {
    const expMs = Date.parse(parsed.expirationTime);
    if (!Number.isFinite(expMs)) {
      return new SiweAuthError(
        400,
        "message_expiration_unparseable",
        "Expiration Time field present but not a valid ISO-8601 timestamp.",
      ).toResponse();
    }
    if (expMs <= Date.now()) {
      return new SiweAuthError(
        400,
        "message_expired",
        "Message expirationTime has passed.",
      ).toResponse();
    }
    messageExpiresAtMs = expMs;
  }

  // Atomically claim the nonce BEFORE running the (slow, racy) signature
  // verification. The conditional UPDATE is the only consume-once guarantee
  // D1 gives us — without it, two concurrent verifies for the same
  // {message, signature} both pass and both mint a session token.
  const lowerAddress = parsed.address.toLowerCase();
  const claim = await env.DB.prepare(
    "UPDATE siwe_nonces SET used = 1, address = ? WHERE nonce = ? AND used = 0",
  )
    .bind(lowerAddress, parsed.nonce)
    .run();
  if (claim.meta.changes !== 1) {
    // Either the nonce was never issued, was already used, or another
    // request claimed it concurrently. Look up the row to disambiguate
    // the error code, but treat all three as the same outward result.
    const row = await env.DB.prepare(
      "SELECT nonce, used, issued_at FROM siwe_nonces WHERE nonce = ?",
    )
      .bind(parsed.nonce)
      .first<{ nonce: string; used: number; issued_at: number }>();
    if (row === null) {
      return new SiweAuthError(
        400,
        "unknown_nonce",
        "Nonce was never issued or has been GC'd.",
      ).toResponse();
    }
    return new SiweAuthError(400, "nonce_used", "Nonce has already been redeemed.").toResponse();
  }

  const nowSec = Math.floor(Date.now() / 1000);
  // Re-read the issued_at to enforce the 5-minute TTL after claiming. If
  // expired, the nonce has now been "burned" without issuing a token —
  // intentional: an attacker can't replay an expired nonce, but a slow
  // client that races past the deadline loses the nonce too. They retry
  // with a fresh nonce.
  const claimed = await env.DB.prepare("SELECT issued_at FROM siwe_nonces WHERE nonce = ?")
    .bind(parsed.nonce)
    .first<{ issued_at: number }>();
  if (claimed === null || nowSec - claimed.issued_at > NONCE_TTL_SECONDS) {
    return new SiweAuthError(
      400,
      "nonce_expired",
      "Nonce is older than 5 minutes. Request a new one and re-sign.",
    ).toResponse();
  }

  // Verify the signature. Now that the nonce is consumed, even a successful
  // signature verification can't be replayed.
  let valid: boolean;
  try {
    valid = await verifyMessage({
      address: parsed.address as Address,
      message: body.message,
      signature: body.signature as `0x${string}`,
    });
  } catch (err) {
    console.error("siwe verifyMessage threw", err);
    return new SiweAuthError(
      400,
      "invalid_signature",
      "Signature could not be verified.",
    ).toResponse();
  }
  if (!valid) {
    return new SiweAuthError(
      400,
      "invalid_signature",
      "Signature does not match address.",
    ).toResponse();
  }
  // Suppress unused-var lint for messageExpiresAtMs — kept for future use
  // (e.g. capping session expiry to the message's stated lifetime).
  void messageExpiresAtMs;

  const payload: SiwePayload = {
    sub: lowerAddress,
    iat: nowSec,
    exp: nowSec + SESSION_TTL_SECONDS,
  };
  const token = await signSessionToken(env.SIWE_HMAC_SECRET, payload);
  return Response.json({ token, address: getAddress(parsed.address), expiresAt: payload.exp });
}

/**
 * Guard for write endpoints. Reads `Authorization: Bearer <token>`,
 * verifies the HMAC, checks `exp`, and returns the authenticated
 * address (checksummed).
 *
 * Throws `SiweAuthError` on any failure. Callers should catch and
 * return `err.toResponse()`.
 */
export async function requireSiwe(request: Request, env: Env): Promise<{ address: Address }> {
  if (!env.SIWE_HMAC_SECRET) {
    throw siweMisconfigured();
  }
  const header = request.headers.get("authorization");
  if (header === null) {
    throw new SiweAuthError(401, "missing_auth", "Authorization header is required.");
  }
  const trimmed = header.trim();
  if (!/^Bearer\s+/i.test(trimmed)) {
    throw new SiweAuthError(401, "invalid_auth", "Authorization must use the Bearer scheme.");
  }
  const token = trimmed.replace(/^Bearer\s+/i, "").trim();
  if (token.length === 0) {
    throw new SiweAuthError(401, "invalid_auth", "Bearer token is empty.");
  }
  const payload = await verifySessionToken(env.SIWE_HMAC_SECRET, token);
  return { address: getAddress(payload.sub) };
}

/**
 * Like {@link requireSiwe} but never throws. Returns `null` when no
 * Authorization header is present, the token is invalid, expired, or
 * the HMAC secret isn't provisioned. Use this on read endpoints where
 * the public-only fallback is acceptable.
 */
export async function optionalSiwe(
  request: Request,
  env: Env,
): Promise<{ address: Address } | null> {
  if (!env.SIWE_HMAC_SECRET) return null;
  const header = request.headers.get("authorization");
  if (header === null) return null;
  const trimmed = header.trim();
  if (!/^Bearer\s+/i.test(trimmed)) return null;
  const token = trimmed.replace(/^Bearer\s+/i, "").trim();
  if (token.length === 0) return null;
  try {
    const payload = await verifySessionToken(env.SIWE_HMAC_SECRET, token);
    return { address: getAddress(payload.sub) };
  } catch {
    return null;
  }
}
