/**
 * Internal Swarm upload helper used by both `/api/upload` and the
 * agent runner (`/api/agent/run`).
 *
 * Strategy:
 *
 *   1. Compute the BMT keccak256 root of the payload locally (via
 *      `@kanbantic/swarm-verified-fetch`). This is the canonical
 *      Swarm reference and the value any verified-fetch reader will
 *      independently re-derive on read.
 *   2. POST the bytes to the public Swarm gateway
 *      (`https://api.gateway.ethswarm.org/bzz`). On success the
 *      gateway returns `{ reference: '...' }` — we double-check it
 *      matches our locally computed root and return it.
 *   3. If the gateway rejects (rate-limit, missing postage stamp,
 *      unreachable), fall back to **local-hash mode**: store the
 *      bytes in D1's `local_swarm_blobs` keyed by the BMT root, and
 *      return that root. The matching `GET /api/swarm/:ref` endpoint
 *      serves the bytes back. This keeps every reference verifiable
 *      with the same `swarm-verified-fetch` library, just against the
 *      worker's own gateway URL.
 *
 * v0.1 limit: payloads must fit in a single Swarm chunk (≤ 4096 bytes).
 * The BMT helper rejects anything larger; the upload endpoint surfaces
 * that as a 413.
 */

import { bmtRoot, bytesToHex, SWARM_CHUNK_SIZE } from "@kanbantic/swarm-verified-fetch";

import type { Env } from "../env.js";

const SWARM_GATEWAY_UPLOAD_URL = "https://api.gateway.ethswarm.org/bzz";

export type UploadMode = "gateway" | "local";

export interface UploadResult {
  /** BMT keccak256 root, lowercase hex with `0x` prefix. */
  ref: `0x${string}`;
  /** Where the bytes are addressable. */
  mode: UploadMode;
  /** Number of bytes uploaded. */
  size: number;
}

export class UploadTooLargeError extends Error {
  override readonly name = "UploadTooLargeError";
}

interface SwarmGatewayResponse {
  reference?: string;
}

/**
 * Upload bytes to Swarm — gateway-first, local-fallback.
 *
 * `gatewayFetch` is overridable so tests can stub the network without
 * monkey-patching the global; production callers leave it default.
 */
export async function uploadBytes(
  env: Env,
  bytes: Uint8Array,
  options: { gatewayFetch?: typeof fetch } = {},
): Promise<UploadResult> {
  if (bytes.length > SWARM_CHUNK_SIZE) {
    throw new UploadTooLargeError(
      `Payload is ${String(bytes.length)} bytes; v0.1 only supports single-chunk uploads (max ${String(SWARM_CHUNK_SIZE)}).`,
    );
  }

  const root = bmtRoot(bytes);
  const ref: `0x${string}` = `0x${bytesToHex(root)}`;

  // Try the public gateway. We pass `Content-Type: application/octet-stream`
  // and the optional `Swarm-Postage-Batch-Id: 0` header — the public
  // gateway has been observed to accept tiny anonymous uploads, but
  // when it doesn't (rate-limit / stamp required) we silently fall
  // back rather than fail the user request.
  const fetchImpl = options.gatewayFetch ?? fetch;
  let gatewayOk = false;
  let gatewayRef: string | null = null;
  try {
    const res = await fetchImpl(SWARM_GATEWAY_UPLOAD_URL, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "swarm-postage-batch-id": "0".repeat(64),
      },
      body: bytes,
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as SwarmGatewayResponse;
      if (typeof body.reference === "string" && body.reference.length > 0) {
        gatewayOk = true;
        gatewayRef = body.reference.startsWith("0x")
          ? body.reference.toLowerCase()
          : `0x${body.reference.toLowerCase()}`;
      }
    } else {
      console.warn("swarm gateway POST returned non-ok", {
        status: res.status,
        statusText: res.statusText,
      });
    }
  } catch (err) {
    console.warn("swarm gateway POST threw, falling back to local", err);
  }

  if (gatewayOk) {
    // Sanity check: the gateway-returned ref must equal our local BMT
    // root. If it doesn't, the bytes were tampered in transit (or the
    // gateway is buggy) — surface as local-mode rather than trust the
    // gateway's value.
    if (gatewayRef !== ref) {
      console.warn("swarm gateway returned mismatched ref, falling back to local", {
        expected: ref,
        actual: gatewayRef,
      });
    } else {
      return { ref, mode: "gateway", size: bytes.length };
    }
  }

  // Local fallback: store the bytes in D1 under the BMT root.
  await env.DB.prepare(
    "INSERT OR REPLACE INTO local_swarm_blobs (ref, content, ts) VALUES (?, ?, ?)",
  )
    .bind(ref, bytes, Math.floor(Date.now() / 1000))
    .run();

  return { ref, mode: "local", size: bytes.length };
}
