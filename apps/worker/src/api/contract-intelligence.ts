/**
 * POST /api/contract-intelligence/run
 *
 * Body: { taskKind: 'audit' | 'explain' | 'similarity', address: '0x...' }
 *
 * Pipeline (Phase 7 v0.1):
 *  1. Validate body shape (address regex, taskKind enum).
 *  2. For `similarity` — short-circuit with a not-implemented envelope.
 *  3. For `audit` / `explain` — fetch verified source from Sourcify v2
 *     via @kanbantic/sourcify-client.
 *  4. If unverified — return a `{ error: 'not_verified' }` envelope.
 *  5. Else — build a stubbed markdown report that quotes the first
 *     ~800 chars of the primary `.sol` source so judges can see the
 *     Sourcify pipeline is real. Real LLM call lands when
 *     `AI_GATEWAY_TOKEN` env is set (see `// TODO(ai-gateway)` below).
 *
 * The stubbed branch is intentional — Sponsor 2's differentiator is
 * the *Sourcify routing*, not the LLM. The Vercel AI Gateway wire-up
 * is mechanical follow-up work once the token is provisioned.
 */

import { lookup, type SourcifyMatch } from "@kanbantic/sourcify-client";

import type { Env } from "../env.js";

const SEPOLIA_CHAIN_ID = 11155111;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SOURCE_PREVIEW_CHARS = 800;

const TASK_KINDS = ["audit", "explain", "similarity"] as const;
type TaskKind = (typeof TASK_KINDS)[number];

interface RunBody {
  taskKind: TaskKind;
  address: string;
}

function isTaskKind(value: unknown): value is TaskKind {
  return typeof value === "string" && (TASK_KINDS as readonly string[]).includes(value);
}

function parseBody(value: unknown): RunBody | { error: string } {
  if (typeof value !== "object" || value === null) {
    return { error: "body must be a JSON object" };
  }
  const record = value as Record<string, unknown>;
  const taskKindRaw = record["taskKind"];
  const addressRaw = record["address"];
  if (!isTaskKind(taskKindRaw)) {
    return { error: `taskKind must be one of: ${TASK_KINDS.join(", ")}` };
  }
  if (typeof addressRaw !== "string" || !ADDRESS_REGEX.test(addressRaw)) {
    return { error: "address must be a 0x-prefixed 40-char hex string" };
  }
  return { taskKind: taskKindRaw, address: addressRaw };
}

function pickPrimarySource(sources: Record<string, string>): { path: string; content: string } {
  // Prefer the .sol file whose path looks most like a top-level contract:
  // shortest path among `.sol` files (deepest paths are usually OZ /
  // library deps). Falls back to the first source if no `.sol`.
  const solEntries = Object.entries(sources).filter(([path]) => path.endsWith(".sol"));
  const pool = solEntries.length > 0 ? solEntries : Object.entries(sources);
  pool.sort((a, b) => a[0].length - b[0].length);
  const first = pool[0];
  if (!first) {
    return { path: "<empty>", content: "" };
  }
  return { path: first[0], content: first[1] };
}

function buildStubReport(
  taskKind: "audit" | "explain",
  address: string,
  match: SourcifyMatch,
): string {
  const sources = match.sources ?? {};
  const primary = pickPrimarySource(sources);
  const preview = primary.content.slice(0, SOURCE_PREVIEW_CHARS);
  const matchLabel =
    match.match === "exact_match"
      ? "exact_match (bytecode + metadata)"
      : "partial_match (bytecode only)";

  const header =
    `# Contract Intelligence — ${taskKind} report\n\n` +
    `**Address:** \`${address}\` (Sepolia)\n` +
    `**Sourcify match:** ${matchLabel}\n` +
    `**Primary source:** \`${primary.path}\`\n\n`;

  const sourceBlock =
    `## Verified source fetched\n\n` +
    "```solidity\n" +
    preview +
    (primary.content.length > SOURCE_PREVIEW_CHARS ? "\n// …truncated…" : "") +
    "\n```\n\n";

  // TODO(ai-gateway): when AI_GATEWAY_TOKEN env is set, replace this
  // stub block with a real call to claude-sonnet-4-6 via the Vercel
  // AI Gateway. Audit prompt asks for severity-labeled findings with
  // line citations; explain prompt asks for a 3-paragraph
  // non-developer summary.
  const stubFindings =
    taskKind === "audit"
      ? `## Findings (stub)\n\n` +
        `Real audit lands when \`AI_GATEWAY_TOKEN\` env is set. ` +
        `The pipeline successfully fetched verified source from Sourcify.\n`
      : `## Explanation (stub)\n\n` +
        `Real plain-English explanation lands when \`AI_GATEWAY_TOKEN\` env is set. ` +
        `The pipeline successfully fetched verified source from Sourcify.\n`;

  return header + sourceBlock + stubFindings;
}

export async function contractIntelligenceHandler(request: Request, _env: Env): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Body is not valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseBody(raw);
  if ("error" in parsed) {
    return Response.json({ error: "invalid_request", message: parsed.error }, { status: 400 });
  }

  const { taskKind, address } = parsed;

  if (taskKind === "similarity") {
    return Response.json({
      kind: taskKind,
      address,
      error: "not_implemented_v01",
      message:
        "Similarity-match lands in v0.2. For now, query the Sourcify dataset on BigQuery directly.",
    });
  }

  let match: SourcifyMatch;
  try {
    match = await lookup(SEPOLIA_CHAIN_ID, address);
  } catch (err) {
    console.error("sourcify lookup failed", err);
    return Response.json(
      {
        error: "sourcify_unavailable",
        message: "Sourcify v2 lookup failed. Try again shortly.",
      },
      { status: 502 },
    );
  }

  if (match.match === "none") {
    return Response.json({
      kind: taskKind,
      address,
      error: "not_verified",
      message:
        "Address is not verified on Sourcify. Paste a verified address — e.g., one of Kanbantic's 5 contracts.",
    });
  }

  const report = buildStubReport(taskKind, address, match);

  return Response.json({
    kind: taskKind,
    address,
    sourcifyMatch: match.match,
    report,
    sourcifyUrl: `https://sourcify.dev/lookup/${address}`,
  });
}
