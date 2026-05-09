import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";
import { decode } from "./decode.js";
import { handleAgentEvent } from "./handlers/agent.js";
import { handleArbiterEvent } from "./handlers/arbiter.js";
import { handleBountyEvent } from "./handlers/bounty.js";
import { handleReputationEvent } from "./handlers/reputation.js";
import { handleWorkspaceEvent } from "./handlers/workspace.js";
import { blockNumber, fetchLogs } from "./poll.js";

const ALARM_INTERVAL_MS = 5_000;
const SAFETY_LAG_BLOCKS = 1;

export interface TickResult {
  from: number;
  to: number;
  logs: number;
}

export class IndexerCursor implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/tick") {
      const result = await this.tick();
      return Response.json(result);
    }
    return new Response("not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.tick();
    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
  }

  async tick(): Promise<TickResult> {
    await applyMigrations(this.env.DB);

    const chainId = Number(this.env.SEPOLIA_CHAIN_ID);
    const head = await blockNumber(this.env.SEPOLIA_RPC);
    const safeHead = Math.max(head - SAFETY_LAG_BLOCKS, 0);

    const cursorRow = await this.env.DB.prepare(
      "SELECT last_block FROM index_cursor WHERE chain_id = ?",
    )
      .bind(chainId)
      .first<{ last_block: number }>();
    const lastBlock = cursorRow?.last_block ?? 0;

    if (lastBlock >= safeHead) {
      await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
      return { from: lastBlock + 1, to: safeHead, logs: 0 };
    }

    const from = lastBlock + 1;
    const chunkBlocks = Number(this.env.INDEXER_CHUNK_BLOCKS);
    const logs = await fetchLogs(this.env.SEPOLIA_RPC, from, safeHead, chunkBlocks);

    // Dispatch each decoded log. If any handler throws, abort this tick
    // without advancing the cursor — handlers are idempotent (INSERT OR IGNORE
    // or explicit upserts), so the next tick will safely replay the batch.
    const ts = Math.floor(Date.now() / 1000);
    try {
      for (const raw of logs) {
        const decoded = decode(raw);
        if (!decoded) continue;
        switch (decoded.contract) {
          case "WorkspaceRegistry":
            await handleWorkspaceEvent(this.env.DB, decoded, ts);
            break;
          case "AgentRegistry":
            await handleAgentEvent(this.env.DB, decoded, ts);
            break;
          case "BountyBoard":
            await handleBountyEvent(this.env.DB, decoded, ts);
            break;
          case "ReputationAttestor":
            await handleReputationEvent(this.env.DB, decoded, ts);
            break;
          case "ArbiterCouncil":
            await handleArbiterEvent(this.env.DB, decoded, ts);
            break;
        }
      }
    } catch (err) {
      console.error("indexer: handler error, skipping cursor advance", err);
      await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
      return { from, to: safeHead, logs: 0 };
    }

    await this.env.DB.prepare(
      "INSERT INTO index_cursor (chain_id, last_block, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(chain_id) DO UPDATE SET last_block = excluded.last_block, updated_at = excluded.updated_at",
    )
      .bind(chainId, safeHead)
      .run();

    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    return { from, to: safeHead, logs: logs.length };
  }
}
