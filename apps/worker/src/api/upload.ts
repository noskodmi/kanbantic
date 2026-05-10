/**
 * POST /api/upload
 *
 * SIWE-gated. Streams raw bytes to Swarm (gateway-first, D1-fallback)
 * and returns the BMT keccak256 reference. See `src/swarm/upload.ts`
 * for the gateway/local strategy.
 *
 * Response shape:
 *   { ref: '0x…64 hex chars', mode: 'gateway' | 'local', size: number }
 *
 * Request body: raw bytes. Content-Type is irrelevant; the worker
 * never inspects the payload. v0.1 caps at 4 KB (one Swarm chunk).
 *
 *
 * GET /api/swarm/:ref
 *
 * Public read endpoint for blobs that fell into local-fallback mode.
 * The bytes are returned as `application/octet-stream`; integrity is
 * intentionally NOT re-verified server-side — verification is the
 * caller's job (using `@kanbantic/swarm-verified-fetch`), which is
 * the entire point of a content-addressed reference.
 */

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";
import type { RouteContext } from "../router.js";
import { requireSiwe, SiweAuthError } from "../auth/siwe.js";
import { SWARM_CHUNK_SIZE, uploadBytes, UploadTooLargeError } from "../swarm/upload.js";

const REF_REGEX = /^0x[a-fA-F0-9]{64}$/;

export async function uploadHandler(request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);

  try {
    await requireSiwe(request, env);
  } catch (err) {
    if (err instanceof SiweAuthError) return err.toResponse();
    throw err;
  }

  // Reject oversized payloads at the I/O boundary before buffering. Without
  // this, an authenticated caller could stream up to Cloudflare's 100 MB body
  // limit and the worker would buffer it all into memory before the
  // downstream chunk-size guard (~4 KB) fires.
  const contentLengthRaw = request.headers.get("content-length");
  if (contentLengthRaw !== null) {
    const declared = Number.parseInt(contentLengthRaw, 10);
    if (Number.isFinite(declared) && declared > SWARM_CHUNK_SIZE) {
      return Response.json(
        {
          error: "payload_too_large",
          message: `Body exceeds the ${String(SWARM_CHUNK_SIZE)}-byte v0.1 single-chunk cap.`,
        },
        { status: 413 },
      );
    }
  }

  const body = await request.arrayBuffer();
  const bytes = new Uint8Array(body);
  if (bytes.length === 0) {
    return Response.json(
      { error: "empty_body", message: "Request body must contain at least one byte." },
      { status: 400 },
    );
  }

  try {
    const result = await uploadBytes(env, bytes);
    return Response.json(result);
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return Response.json({ error: "payload_too_large", message: err.message }, { status: 413 });
    }
    console.error("upload handler failed", err);
    return Response.json(
      { error: "upload_failed", message: "Upload could not be persisted." },
      { status: 500 },
    );
  }
}

interface SwarmBlobRow {
  content: ArrayBuffer | Uint8Array;
}

export async function swarmReadHandler(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  routeCtx: RouteContext,
): Promise<Response> {
  await applyMigrations(env.DB);

  const refRaw = routeCtx.params["ref"];
  if (refRaw === undefined) {
    return Response.json({ error: "missing_ref" }, { status: 400 });
  }
  const ref = refRaw.startsWith("0x") ? refRaw.toLowerCase() : `0x${refRaw.toLowerCase()}`;
  if (!REF_REGEX.test(ref)) {
    return Response.json(
      { error: "invalid_ref", message: "Reference must be 0x-prefixed 32-byte hex." },
      { status: 400 },
    );
  }

  const row = await env.DB.prepare("SELECT content FROM local_swarm_blobs WHERE ref = ?")
    .bind(ref)
    .first<SwarmBlobRow>();
  if (row === null) {
    return Response.json(
      { error: "not_found", message: "Reference not present in local Swarm cache." },
      { status: 404 },
    );
  }

  // D1 returns BLOB columns as ArrayBuffer.
  const content = row.content instanceof Uint8Array ? row.content : new Uint8Array(row.content);
  return new Response(content, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
