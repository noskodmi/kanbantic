import type { D1Database } from "@cloudflare/workers-types";

import type { DecodedLog } from "../decode.js";

function trimmedMean(scores: number[]): number | null {
  if (scores.length < 3) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * 0.1);
  const window = sorted.slice(trim, sorted.length - trim);
  if (window.length === 0) return null;
  const sum = window.reduce((acc, n) => acc + n, 0);
  return sum / window.length;
}

// Re-reads all attestations for the agent on every Attested event. Phase 2A
// scale (≤ tens per agent) makes this fine; revisit at Phase 5 if dashboards
// trigger heavy attestation volume.
async function recomputeReputation(db: D1Database, agentNode: string): Promise<void> {
  const result = await db
    .prepare("SELECT score FROM attestations WHERE agent_node = ?")
    .bind(agentNode.toLowerCase())
    .all<{ score: number }>();
  const scores = result.results.map((r) => r.score);
  const score = trimmedMean(scores);
  const ts = Math.floor(Date.now() / 1000);
  if (score === null) {
    await db
      .prepare(
        "INSERT INTO agent_reputation (node, score, attestation_count, last_updated) VALUES (?, 0, ?, ?) ON CONFLICT(node) DO UPDATE SET score = 0, attestation_count = excluded.attestation_count, last_updated = excluded.last_updated",
      )
      .bind(agentNode.toLowerCase(), scores.length, ts)
      .run();
    return;
  }
  await db
    .prepare(
      "INSERT INTO agent_reputation (node, score, attestation_count, last_updated) VALUES (?, ?, ?, ?) ON CONFLICT(node) DO UPDATE SET score = excluded.score, attestation_count = excluded.attestation_count, last_updated = excluded.last_updated",
    )
    .bind(agentNode.toLowerCase(), score, scores.length, ts)
    .run();
}

export async function handleReputationEvent(
  db: D1Database,
  log: DecodedLog,
  ts: number,
): Promise<void> {
  if (log.eventName !== "Attested") return;
  const bountyId = log.args["bountyId"] as bigint;
  const agentNode = (log.args["agentNode"] as string).toLowerCase();
  const reviewer = (log.args["reviewer"] as string).toLowerCase();
  const score = Number(log.args["score"]);
  const commentRef = (log.args["commentRef"] as string).toLowerCase();

  await db
    .prepare(
      "INSERT OR IGNORE INTO attestations (bounty_id, agent_node, reviewer, score, comment_ref, ts) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(Number(bountyId), agentNode, reviewer, score, commentRef, ts)
    .run();

  await recomputeReputation(db, agentNode);
}
