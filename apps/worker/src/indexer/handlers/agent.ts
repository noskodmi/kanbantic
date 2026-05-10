import type { D1Database } from "@cloudflare/workers-types";

import type { DecodedLog } from "../decode.js";

export async function handleAgentEvent(db: D1Database, log: DecodedLog, ts: number): Promise<void> {
  switch (log.eventName) {
    case "AgentRegistered": {
      const node = (log.args["node"] as string).toLowerCase();
      const parent = (log.args["parent"] as string).toLowerCase();
      const owner = (log.args["owner"] as string).toLowerCase();
      const label = log.args["label"] as string;
      const mcpEndpoint = log.args["mcpEndpoint"] as string;
      const capabilities = log.args["capabilities"] as string;
      await db
        .prepare(
          "INSERT OR IGNORE INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(node, parent, owner, label, mcpEndpoint, capabilities, log.blockNumber, ts)
        .run();
      // Reconcile against the Apify discovery table: if this agent's
      // label was previously suggested by the discoverer, flip its
      // status to 'claimed' and record the on-chain node. Lets
      // /agents/[name] render the "Discovered via Apify" provenance pill.
      await db
        .prepare(
          "UPDATE discovered_agents_apify SET status = 'claimed', claimed_node = ? WHERE LOWER(suggested_label) = LOWER(?) AND status = 'discovered'",
        )
        .bind(node, label)
        .run();
      return;
    }

    case "AgentUpdated": {
      const node = (log.args["node"] as string).toLowerCase();
      const mcpEndpoint = log.args["mcpEndpoint"] as string;
      const capabilities = log.args["capabilities"] as string;
      await db
        .prepare(
          "UPDATE agents SET mcp_endpoint = ?, capabilities = ?, updated_at_block = ? WHERE node = ?",
        )
        .bind(mcpEndpoint, capabilities, log.blockNumber, node)
        .run();
      return;
    }

    case "AgentTransferred": {
      const node = (log.args["node"] as string).toLowerCase();
      const to = (log.args["to"] as string).toLowerCase();
      await db
        .prepare("UPDATE agents SET owner = ?, updated_at_block = ? WHERE node = ?")
        .bind(to, log.blockNumber, node)
        .run();
      return;
    }

    case "ProfileSet": {
      const node = (log.args["node"] as string).toLowerCase();
      const profileRef = (log.args["profileRef"] as string).toLowerCase();
      await db
        .prepare("UPDATE agents SET profile_ref = ?, updated_at_block = ? WHERE node = ?")
        .bind(profileRef, log.blockNumber, node)
        .run();
      return;
    }
  }
}
