import type { D1Database } from "@cloudflare/workers-types";

import type { DecodedLog } from "../decode.js";

async function appendHistory(
  db: D1Database,
  bountyId: bigint,
  statusFrom: string | null,
  statusTo: string,
  log: DecodedLog,
  ts: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO bounty_history (bounty_id, status_from, status_to, tx_hash, log_index, block_number, ts) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Number(bountyId), statusFrom, statusTo, log.txHash, log.logIndex, log.blockNumber, ts)
    .run();
}

async function currentStatus(db: D1Database, bountyId: bigint): Promise<string | null> {
  const row = await db
    .prepare("SELECT status FROM bounties WHERE id = ?")
    .bind(Number(bountyId))
    .first<{ status: string }>();
  return row?.status ?? null;
}

export async function handleBountyEvent(
  db: D1Database,
  log: DecodedLog,
  ts: number,
): Promise<void> {
  const bountyId = log.args["id"] as bigint;

  switch (log.eventName) {
    case "BountyPosted": {
      const claimWindow = Number((log.args["claimWindowBlocks"] as bigint | undefined) ?? 0n);
      const initialStatus = claimWindow > 0 ? "ClaimWindowOpen" : "Open";
      await db
        .prepare(
          "INSERT OR IGNORE INTO bounties (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks, claim_window_start_block, status, workspace_node, arbiter_council, created_at_block, created_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          Number(bountyId),
          (log.args["poster"] as string).toLowerCase(),
          log.args["capabilityFilter"] as string,
          (log.args["reward"] as bigint).toString(),
          (log.args["descriptionRef"] as string).toLowerCase(),
          Number(log.args["expiresAt"] as bigint),
          claimWindow,
          log.blockNumber,
          initialStatus,
          (log.args["workspaceNode"] as string).toLowerCase(),
          (log.args["arbiterCouncil"] as string).toLowerCase(),
          log.blockNumber,
          ts,
        )
        .run();
      await appendHistory(db, bountyId, null, initialStatus, log, ts);
      return;
    }

    case "BountyClaimCommitted": {
      await db
        .prepare(
          "INSERT INTO claim_commitments (bounty_id, address, commitment_hash, ts) VALUES (?, ?, ?, ?) ON CONFLICT(bounty_id, address) DO UPDATE SET commitment_hash = excluded.commitment_hash, ts = excluded.ts",
        )
        .bind(
          Number(bountyId),
          (log.args["committer"] as string).toLowerCase(),
          (log.args["commitment"] as string).toLowerCase(),
          ts,
        )
        .run();
      return;
    }

    case "BountyClaimFinalized": {
      const from = await currentStatus(db, bountyId);
      await db
        .prepare("UPDATE bounties SET status = 'ClaimWindowClosed' WHERE id = ?")
        .bind(Number(bountyId))
        .run();
      await appendHistory(db, bountyId, from, "ClaimWindowClosed", log, ts);
      return;
    }

    case "BountyClaimed": {
      const from = await currentStatus(db, bountyId);
      await db
        .prepare(
          "UPDATE bounties SET status = 'Claimed', claimer_node = ?, claimer_address = ? WHERE id = ?",
        )
        .bind(
          (log.args["agentNode"] as string).toLowerCase(),
          (log.args["claimer"] as string).toLowerCase(),
          Number(bountyId),
        )
        .run();
      await appendHistory(db, bountyId, from, "Claimed", log, ts);
      return;
    }

    case "BountySubmitted": {
      const from = await currentStatus(db, bountyId);
      await db
        .prepare("UPDATE bounties SET status = 'Submitted', submission_ref = ? WHERE id = ?")
        .bind((log.args["proofRef"] as string).toLowerCase(), Number(bountyId))
        .run();
      await appendHistory(db, bountyId, from, "Submitted", log, ts);
      return;
    }

    case "BountyAccepted": {
      const from = await currentStatus(db, bountyId);
      await db
        .prepare("UPDATE bounties SET status = 'Resolved', resolved_at_block = ? WHERE id = ?")
        .bind(log.blockNumber, Number(bountyId))
        .run();
      await appendHistory(db, bountyId, from, "Resolved", log, ts);
      return;
    }

    case "BountyRejected": {
      const from = await currentStatus(db, bountyId);
      await db
        .prepare("UPDATE bounties SET status = 'Disputed' WHERE id = ?")
        .bind(Number(bountyId))
        .run();
      await appendHistory(db, bountyId, from, "Disputed", log, ts);
      return;
    }

    case "BountySettled": {
      const from = await currentStatus(db, bountyId);
      const refunded = log.args["refunded"] as boolean;
      const status = refunded ? "Refunded" : "Resolved";
      await db
        .prepare("UPDATE bounties SET status = ?, resolved_at_block = ? WHERE id = ?")
        .bind(status, log.blockNumber, Number(bountyId))
        .run();
      await appendHistory(db, bountyId, from, status, log, ts);
      return;
    }

    case "BountyExpired": {
      const from = await currentStatus(db, bountyId);
      await db
        .prepare("UPDATE bounties SET status = 'Refunded', resolved_at_block = ? WHERE id = ?")
        .bind(log.blockNumber, Number(bountyId))
        .run();
      await appendHistory(db, bountyId, from, "Refunded", log, ts);
      return;
    }
  }
}
