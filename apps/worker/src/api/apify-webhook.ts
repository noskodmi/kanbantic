/**
 * `POST /api/apify-webhook` — inbound webhook from the
 * `@kanbantic/apify-discoverer` Actor.
 *
 * Why HMAC instead of X402: webhooks are server-to-server callbacks the
 * sender authenticates by signing the body with a shared secret. X402
 * gates outbound paywalled HTTP, not inbound triggers — wrong primitive.
 *
 * Security:
 * - `x-apify-signature` header MUST be a hex-encoded HMAC-SHA256 of the
 *   raw request body using `env.APIFY_WEBHOOK_SECRET`.
 * - We compare in constant time (manual pass; the slice lengths are
 *   pinned at 64 chars so a difference on the first byte still walks
 *   the whole string).
 * - When the secret is unset the route returns 503 — discovery is an
 *   opt-in feature per deploy.
 *
 * Side effect: optional GitHub issue creation if `env.GITHUB_APP_TOKEN`
 * is set. Failure to open the issue is logged but does NOT fail the
 * webhook — the upsert is the source of truth for the dashboard.
 */

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";

interface DiscoveredRecordPayload {
  repo_url: string;
  mcp_path?: string | null;
  suggested_label: string;
  discovered_at: number;
}

const REPO_URL_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export async function apifyWebhookHandler(request: Request, env: Env): Promise<Response> {
  if (!env.APIFY_WEBHOOK_SECRET) {
    return Response.json(
      { error: "apify webhook disabled (APIFY_WEBHOOK_SECRET unset)" },
      { status: 503 },
    );
  }

  const sig = request.headers.get("x-apify-signature");
  if (!sig) {
    return Response.json({ error: "missing x-apify-signature" }, { status: 401 });
  }

  const raw = await request.text();
  const expected = await hmacHex(env.APIFY_WEBHOOK_SECRET, raw);
  if (!constantTimeEqual(sig.toLowerCase(), expected)) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(payload)) {
    return Response.json({ error: "expected JSON array of records" }, { status: 400 });
  }

  const records: DiscoveredRecordPayload[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r["repo_url"] !== "string" || !REPO_URL_RE.test(r["repo_url"])) continue;
    if (typeof r["suggested_label"] !== "string" || !LABEL_RE.test(r["suggested_label"])) continue;
    if (typeof r["discovered_at"] !== "number" || !Number.isFinite(r["discovered_at"])) continue;
    const mcpPath = typeof r["mcp_path"] === "string" ? r["mcp_path"] : null;
    records.push({
      repo_url: r["repo_url"],
      mcp_path: mcpPath,
      suggested_label: r["suggested_label"],
      discovered_at: Math.floor(r["discovered_at"]),
    });
  }

  await applyMigrations(env.DB);

  // Upsert by repo_url. We preserve `status` and `claimed_node` if the
  // row already exists (re-discovery shouldn't undo a manual triage),
  // and refresh `discovered_at` to the most recent observation.
  const stmt = env.DB.prepare(
    `INSERT INTO discovered_agents_apify
       (repo_url, mcp_path, suggested_label, status, claimed_node, discovered_at)
     VALUES (?, ?, ?, 'discovered', NULL, ?)
     ON CONFLICT(repo_url) DO UPDATE SET
       mcp_path = excluded.mcp_path,
       suggested_label = excluded.suggested_label,
       discovered_at = excluded.discovered_at`,
  );

  const ops = records.map((r) =>
    stmt.bind(r.repo_url, r.mcp_path, r.suggested_label, r.discovered_at),
  );
  if (ops.length > 0) {
    await env.DB.batch(ops);
  }

  // Best-effort GitHub issue creation. We never fail the webhook if a
  // single repo issue can't be opened (the repo may have issues
  // disabled, or the token may lack scope). Each failure is logged.
  const ghToken = env.GITHUB_APP_TOKEN;
  if (ghToken) {
    await Promise.allSettled(records.map((r) => createGithubIssue(ghToken, r)));
  } else {
    console.log("apify-webhook: GITHUB_APP_TOKEN unset — issue creation disabled");
  }

  return Response.json({ ok: true, ingested: records.length });
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return bytesToHex(new Uint8Array(sig));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function createGithubIssue(token: string, record: DiscoveredRecordPayload): Promise<void> {
  // repo_url is `https://github.com/<owner>/<repo>` (validated above).
  const path = record.repo_url.replace(/^https:\/\/github\.com\//, "");
  const apiUrl = `https://api.github.com/repos/${path}/issues`;
  const claimUrl = `https://kanbantic.vercel.app/register?label=${encodeURIComponent(record.suggested_label)}`;
  const body = [
    `Hi! Your repo looks like an MCP server (we spotted ${record.mcp_path ?? "an MCP signature"}).`,
    "",
    "**Kanbantic** is an on-chain agent directory + bounty board on Sepolia. We've reserved",
    `\`${record.suggested_label}.kanbantic.eth\` for you — claim it (free, just a Sepolia tx)`,
    "to make your MCP discoverable on the public namespace and eligible for bounties.",
    "",
    `Claim it here: ${claimUrl}`,
    "",
    "Not interested? No worries — close this issue and we won't open another. The discovery",
    "row stays in the index so other agents can browse it.",
  ].join("\n");

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "kanbantic-apify-discoverer",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        title: `Claim ${record.suggested_label}.kanbantic.eth on Kanbantic`,
        body,
      }),
    });
    if (!res.ok) {
      console.warn(
        "apify-webhook: github issue create failed",
        record.repo_url,
        res.status,
        await res.text().catch(() => ""),
      );
    }
  } catch (err) {
    console.warn("apify-webhook: github issue create threw", record.repo_url, err);
  }
}
