import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";
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

    // Handler dispatch is a no-op until Tasks 5-6 land.

    await this.env.DB.prepare(
      "INSERT INTO index_cursor (chain_id, last_block, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(chain_id) DO UPDATE SET last_block = excluded.last_block, updated_at = excluded.updated_at",
    )
      .bind(chainId, safeHead)
      .run();

    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    return { from, to: safeHead, logs: logs.length };
  }
}
