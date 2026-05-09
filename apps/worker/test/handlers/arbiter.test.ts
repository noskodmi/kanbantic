import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";
import type { DecodedLog } from "../../src/indexer/decode.js";
import { handleArbiterEvent } from "../../src/indexer/handlers/arbiter.js";

const TS = 1715300000;

function makeLog(eventName: string, args: Record<string, unknown>, logIndex = 0): DecodedLog {
  return {
    contract: "ArbiterCouncil",
    eventName,
    args,
    blockNumber: 100,
    txHash: "0xabc",
    logIndex,
  };
}

describe("handleArbiterEvent", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM arbiter_votes").run();
    await env.DB.prepare("DELETE FROM arbiter_decisions").run();
  });

  it("Voted inserts arbiter_votes row", async () => {
    await handleArbiterEvent(
      env.DB,
      makeLog("Voted", {
        bountyId: 7n,
        arbiter: "0xARB",
        refund: true,
        reasonRef: "0xREASON",
      }),
      TS,
    );
    const row = await env.DB.prepare(
      "SELECT * FROM arbiter_votes WHERE bounty_id = ? AND arbiter = ?",
    )
      .bind(7, "0xarb")
      .first();
    expect(row?.["refund"]).toBe(1);
    expect(row?.["reason_ref"]).toBe("0xreason");
    expect(row?.["ts"]).toBe(TS);

    // Re-applying same event is a no-op (INSERT OR IGNORE).
    await handleArbiterEvent(
      env.DB,
      makeLog("Voted", {
        bountyId: 7n,
        arbiter: "0xARB",
        refund: false,
        reasonRef: "0xOTHER",
      }),
      TS + 1,
    );
    const after = await env.DB.prepare(
      "SELECT * FROM arbiter_votes WHERE bounty_id = ? AND arbiter = ?",
    )
      .bind(7, "0xarb")
      .first();
    expect(after?.["refund"]).toBe(1);
    expect(after?.["reason_ref"]).toBe("0xreason");
  });

  it("Executed inserts/replaces arbiter_decisions row", async () => {
    await handleArbiterEvent(env.DB, makeLog("Executed", { bountyId: 9n, refunded: false }), TS);
    let row = await env.DB.prepare("SELECT * FROM arbiter_decisions WHERE bounty_id = ?")
      .bind(9)
      .first();
    expect(row?.["refunded"]).toBe(0);
    expect(row?.["executed_at"]).toBe(TS);

    await handleArbiterEvent(env.DB, makeLog("Executed", { bountyId: 9n, refunded: true }), TS + 5);
    row = await env.DB.prepare("SELECT * FROM arbiter_decisions WHERE bounty_id = ?")
      .bind(9)
      .first();
    expect(row?.["refunded"]).toBe(1);
    expect(row?.["executed_at"]).toBe(TS + 5);
  });
});
