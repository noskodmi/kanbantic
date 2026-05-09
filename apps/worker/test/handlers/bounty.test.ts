import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";
import type { DecodedLog } from "../../src/indexer/decode.js";
import { handleBountyEvent } from "../../src/indexer/handlers/bounty.js";

const TS = 1715300000;

interface MakeLogOptions {
  blockNumber?: number;
  txHash?: string;
  logIndex?: number;
}

function makeLog(
  eventName: string,
  args: Record<string, unknown>,
  opts: MakeLogOptions = {},
): DecodedLog {
  return {
    contract: "BountyBoard",
    eventName,
    args,
    blockNumber: opts.blockNumber ?? 100,
    txHash: opts.txHash ?? "0xabc",
    logIndex: opts.logIndex ?? 0,
  };
}

function postedArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1n,
    poster: "0xPOSTER",
    capabilityFilter: "research",
    reward: 1000n,
    descriptionRef: "0xDESC",
    expiresAt: 9999999999n,
    claimWindowBlocks: 0n,
    workspaceNode: "0xWS",
    arbiterCouncil: "0xARB",
    ...overrides,
  };
}

describe("handleBountyEvent", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM bounties").run();
    await env.DB.prepare("DELETE FROM bounty_history").run();
    await env.DB.prepare("DELETE FROM claim_commitments").run();
  });

  it("BountyPosted (instant claim) inserts row with status='Open'", async () => {
    await handleBountyEvent(env.DB, makeLog("BountyPosted", postedArgs()), TS);
    const row = await env.DB.prepare("SELECT * FROM bounties WHERE id = ?")
      .bind(1)
      .first();
    expect(row?.["status"]).toBe("Open");
    expect(row?.["poster"]).toBe("0xposter");
    expect(row?.["claim_window_blocks"]).toBe(0);
    const hist = await env.DB.prepare("SELECT * FROM bounty_history WHERE bounty_id = ?")
      .bind(1)
      .all();
    expect(hist.results.length).toBe(1);
    expect(hist.results[0]?.["status_from"]).toBeNull();
    expect(hist.results[0]?.["status_to"]).toBe("Open");
  });

  it("BountyPosted (fair-claim window) inserts with status='ClaimWindowOpen'", async () => {
    await handleBountyEvent(
      env.DB,
      makeLog("BountyPosted", postedArgs({ claimWindowBlocks: 50n })),
      TS,
    );
    const row = await env.DB.prepare(
      "SELECT status, claim_window_blocks FROM bounties WHERE id = ?",
    )
      .bind(1)
      .first<{ status: string; claim_window_blocks: number }>();
    expect(row?.status).toBe("ClaimWindowOpen");
    expect(row?.claim_window_blocks).toBe(50);
  });

  it("BountyClaimCommitted upserts a commitment", async () => {
    await handleBountyEvent(env.DB, makeLog("BountyPosted", postedArgs()), TS);
    await handleBountyEvent(
      env.DB,
      makeLog("BountyClaimCommitted", {
        id: 1n,
        committer: "0xALICE",
        commitment: "0xHASH1",
      }),
      TS,
    );
    await handleBountyEvent(
      env.DB,
      makeLog("BountyClaimCommitted", {
        id: 1n,
        committer: "0xALICE",
        commitment: "0xHASH2",
      }),
      TS + 1,
    );
    const rows = await env.DB.prepare(
      "SELECT * FROM claim_commitments WHERE bounty_id = ? AND address = ?",
    )
      .bind(1, "0xalice")
      .all();
    expect(rows.results.length).toBe(1);
    expect(rows.results[0]?.["commitment_hash"]).toBe("0xhash2");
    expect(rows.results[0]?.["ts"]).toBe(TS + 1);
  });

  it("Lifecycle Posted -> Claimed -> Submitted -> Accepted advances bounties.status", async () => {
    await handleBountyEvent(
      env.DB,
      makeLog("BountyPosted", postedArgs(), { blockNumber: 100, logIndex: 0 }),
      TS,
    );
    await handleBountyEvent(
      env.DB,
      makeLog(
        "BountyClaimed",
        { id: 1n, agentNode: "0xAGENT", claimer: "0xCLAIMER" },
        { blockNumber: 101, logIndex: 0 },
      ),
      TS + 1,
    );
    let row = await env.DB.prepare("SELECT status FROM bounties WHERE id = ?")
      .bind(1)
      .first<{ status: string }>();
    expect(row?.status).toBe("Claimed");

    await handleBountyEvent(
      env.DB,
      makeLog(
        "BountySubmitted",
        { id: 1n, proofRef: "0xPROOF" },
        { blockNumber: 102, logIndex: 0 },
      ),
      TS + 2,
    );
    row = await env.DB.prepare("SELECT status FROM bounties WHERE id = ?")
      .bind(1)
      .first<{ status: string }>();
    expect(row?.status).toBe("Submitted");

    await handleBountyEvent(
      env.DB,
      makeLog("BountyAccepted", { id: 1n }, { blockNumber: 103, logIndex: 0 }),
      TS + 3,
    );
    row = await env.DB.prepare("SELECT status FROM bounties WHERE id = ?")
      .bind(1)
      .first<{ status: string }>();
    expect(row?.status).toBe("Resolved");

    const hist = await env.DB.prepare(
      "SELECT status_from, status_to FROM bounty_history WHERE bounty_id = ? ORDER BY block_number ASC, log_index ASC",
    )
      .bind(1)
      .all<{ status_from: string | null; status_to: string }>();
    expect(hist.results.length).toBe(4);
    expect(hist.results[0]?.status_from).toBeNull();
    expect(hist.results[0]?.status_to).toBe("Open");
    expect(hist.results[1]?.status_from).toBe("Open");
    expect(hist.results[1]?.status_to).toBe("Claimed");
    expect(hist.results[2]?.status_from).toBe("Claimed");
    expect(hist.results[2]?.status_to).toBe("Submitted");
    expect(hist.results[3]?.status_from).toBe("Submitted");
    expect(hist.results[3]?.status_to).toBe("Resolved");
  });

  it("BountySettled refunded=true -> 'Refunded'; refunded=false -> 'Resolved'", async () => {
    // Refunded case: bounty 1
    await handleBountyEvent(env.DB, makeLog("BountyPosted", postedArgs({ id: 1n })), TS);
    await handleBountyEvent(
      env.DB,
      makeLog("BountySettled", { id: 1n, refunded: true }, { blockNumber: 200, logIndex: 0 }),
      TS + 1,
    );
    let row = await env.DB.prepare("SELECT status, resolved_at_block FROM bounties WHERE id = ?")
      .bind(1)
      .first<{ status: string; resolved_at_block: number }>();
    expect(row?.status).toBe("Refunded");
    expect(row?.resolved_at_block).toBe(200);

    // Resolved case: bounty 2
    await handleBountyEvent(env.DB, makeLog("BountyPosted", postedArgs({ id: 2n })), TS);
    await handleBountyEvent(
      env.DB,
      makeLog(
        "BountySettled",
        { id: 2n, refunded: false },
        { blockNumber: 201, logIndex: 0, txHash: "0xdef" },
      ),
      TS + 1,
    );
    row = await env.DB.prepare("SELECT status, resolved_at_block FROM bounties WHERE id = ?")
      .bind(2)
      .first<{ status: string; resolved_at_block: number }>();
    expect(row?.status).toBe("Resolved");
    expect(row?.resolved_at_block).toBe(201);
  });

  it("BountyExpired sets status='Refunded'", async () => {
    await handleBountyEvent(env.DB, makeLog("BountyPosted", postedArgs()), TS);
    await handleBountyEvent(
      env.DB,
      makeLog("BountyExpired", { id: 1n }, { blockNumber: 300, logIndex: 0 }),
      TS + 1,
    );
    const row = await env.DB.prepare("SELECT status, resolved_at_block FROM bounties WHERE id = ?")
      .bind(1)
      .first<{ status: string; resolved_at_block: number }>();
    expect(row?.status).toBe("Refunded");
    expect(row?.resolved_at_block).toBe(300);
  });
});
