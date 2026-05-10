/**
 * @kanbantic/apify-discoverer — Apify Actor entry point.
 *
 * Lifecycle:
 * 1. `Actor.init()` connects to the platform.
 * 2. Read input (`webhookUrl`, `webhookSecret`, optional
 *    `queryLimit`/`githubToken`).
 * 3. Call `discoverMcpRepos` to scrape GitHub Code Search.
 * 4. POST the batch to the Kanbantic worker webhook with an
 *    HMAC-SHA256 `x-apify-signature` header.
 * 5. `Actor.pushData(records)` so the dataset is browsable in the
 *    Apify console.
 * 6. `Actor.exit()`.
 *
 * Failures inside any step log + propagate to mark the run as failed
 * in the Apify console — by design we don't swallow errors.
 */

import { Actor } from "apify";
import { createHmac } from "node:crypto";

import { discoverMcpRepos } from "./github.js";
import type { DiscoveredRecord } from "./github.js";

interface ActorInput {
  webhookUrl: string;
  webhookSecret: string;
  queryLimit?: number;
  githubToken?: string;
}

export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export async function postToWebhook(
  webhookUrl: string,
  webhookSecret: string,
  records: DiscoveredRecord[],
  fetcher: typeof fetch = fetch,
): Promise<{ status: number; body: string }> {
  const body = JSON.stringify(records);
  const sig = signPayload(webhookSecret, body);
  const res = await fetcher(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-apify-signature": sig,
    },
    body,
  });
  return { status: res.status, body: await res.text() };
}

async function run(): Promise<void> {
  await Actor.init();
  try {
    const input = (await Actor.getInput<ActorInput>()) ?? null;
    if (!input?.webhookUrl || !input.webhookSecret) {
      throw new Error("webhookUrl and webhookSecret are required input fields");
    }

    const limit = Math.max(1, Math.min(input.queryLimit ?? 30, 200));
    const records = await discoverMcpRepos({
      limit,
      ...(input.githubToken ? { token: input.githubToken } : {}),
    });
    console.log(`discovered ${String(records.length)} candidate MCP repos`);

    if (records.length > 0) {
      const { status, body } = await postToWebhook(input.webhookUrl, input.webhookSecret, records);
      if (status >= 300) {
        throw new Error(`webhook POST failed: ${String(status)} ${body}`);
      }
      console.log(`webhook accepted batch: ${body}`);
    }

    await Actor.pushData(records);
  } finally {
    await Actor.exit();
  }
}

// Top-level await is fine in NodeNext ESM; Apify's runtime invokes this
// file directly. Tests import the helpers above without invoking run().
if (process.env["APIFY_IS_AT_HOME"] || process.env["APIFY_LOCAL_STORAGE_DIR"]) {
  await run();
}
