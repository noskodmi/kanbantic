import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";
import type { DecodedLog } from "../../src/indexer/decode.js";
import { handleReputationEvent } from "../../src/indexer/handlers/reputation.js";

const TS = 1715300000;

function makeLog(args: Record<string, unknown>, logIndex = 0): DecodedLog {
  return {
    contract: "ReputationAttestor",
    eventName: "Attested",
    args,
    blockNumber: 100,
    txHash: "0xabc",
    logIndex,
  };
}

describe("handleReputationEvent", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM attestations").run();
    await env.DB.prepare("DELETE FROM agent_reputation").run();
  });

  it("single attestation: row inserted, agent_reputation.score=0 (below threshold of 3)", async () => {
    await handleReputationEvent(
      env.DB,
      makeLog({
        bountyId: 1n,
        agentNode: "0xAGENT",
        reviewer: "0xREV1",
        score: 4n,
        commentRef: "0xCOMMENT",
      }),
      TS,
    );
    const att = await env.DB.prepare("SELECT * FROM attestations WHERE agent_node = ?")
      .bind("0xagent")
      .all();
    expect(att.results.length).toBe(1);
    expect(att.results[0]?.["score"]).toBe(4);
    expect(att.results[0]?.["reviewer"]).toBe("0xrev1");

    const rep = await env.DB.prepare("SELECT * FROM agent_reputation WHERE node = ?")
      .bind("0xagent")
      .first();
    expect(rep?.["score"]).toBe(0);
    expect(rep?.["attestation_count"]).toBe(1);
  });

  it("3 attestations all score 5: trimmed-mean = 5", async () => {
    for (let i = 0; i < 3; i++) {
      await handleReputationEvent(
        env.DB,
        makeLog(
          {
            bountyId: BigInt(i + 1),
            agentNode: "0xAGENT",
            reviewer: `0xREV${i.toString()}`,
            score: 5n,
            commentRef: "0xC",
          },
          i,
        ),
        TS,
      );
    }
    const rep = await env.DB.prepare(
      "SELECT score, attestation_count FROM agent_reputation WHERE node = ?",
    )
      .bind("0xagent")
      .first<{ score: number; attestation_count: number }>();
    expect(rep?.score).toBe(5);
    expect(rep?.attestation_count).toBe(3);
  });

  it("11 attestations mixed scores: trimmed mean discards 1 from each tail", async () => {
    const scores = [1, 2, 3, 3, 4, 4, 4, 5, 5, 5, 5];
    for (let i = 0; i < scores.length; i++) {
      await handleReputationEvent(
        env.DB,
        makeLog(
          {
            bountyId: BigInt(i + 1),
            agentNode: "0xAGENT",
            reviewer: `0xREV${i.toString()}`,
            score: BigInt(scores[i] ?? 0),
            commentRef: "0xC",
          },
          i,
        ),
        TS,
      );
    }
    const rep = await env.DB.prepare(
      "SELECT score, attestation_count FROM agent_reputation WHERE node = ?",
    )
      .bind("0xagent")
      .first<{ score: number; attestation_count: number }>();
    expect(rep?.attestation_count).toBe(11);
    // sorted [1,2,3,3,4,4,4,5,5,5,5], floor(11*0.1)=1, window [2,3,3,4,4,4,5,5,5], sum=35, mean=35/9
    expect(rep?.score).toBeCloseTo(35 / 9, 9);
  });
});
