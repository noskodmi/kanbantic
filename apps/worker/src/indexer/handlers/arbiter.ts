import type { D1Database } from "@cloudflare/workers-types";

import type { DecodedLog } from "../decode.js";

export async function handleArbiterEvent(
  db: D1Database,
  log: DecodedLog,
  ts: number,
): Promise<void> {
  switch (log.eventName) {
    case "Voted": {
      const bountyId = log.args["bountyId"] as bigint;
      const arbiter = (log.args["arbiter"] as string).toLowerCase();
      const refund = (log.args["refund"] as boolean) ? 1 : 0;
      const reasonRef = (log.args["reasonRef"] as string).toLowerCase();
      await db
        .prepare(
          "INSERT OR IGNORE INTO arbiter_votes (bounty_id, arbiter, refund, reason_ref, ts) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(Number(bountyId), arbiter, refund, reasonRef, ts)
        .run();
      return;
    }

    case "Executed": {
      const bountyId = log.args["bountyId"] as bigint;
      const refunded = (log.args["refunded"] as boolean) ? 1 : 0;
      await db
        .prepare(
          "INSERT OR REPLACE INTO arbiter_decisions (bounty_id, refunded, executed_at) VALUES (?, ?, ?)",
        )
        .bind(Number(bountyId), refunded, ts)
        .run();
      return;
    }
  }
}
