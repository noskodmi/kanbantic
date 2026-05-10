/**
 * Tiny OpenRouter client — single chat-completion call, returns the
 * assistant message text. Shared between the Contract Intelligence
 * paywalled endpoint and the agent runner introduced in Phase 2B-A.
 */

import type { Env } from "../env.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
const DEFAULT_REFERRER = "https://kanbantic-api.lizzflix.workers.dev";

export interface CallOpenRouterOptions {
  /** App-level title for OpenRouter dashboards. */
  title: string;
  /** Optional referer URL. Defaults to the production worker URL. */
  referer?: string;
  /** `max_tokens` for the response. Defaults to 1500. */
  maxTokens?: number;
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/**
 * Send `prompt` as a single-turn user message and return the model's
 * markdown text. Throws on non-200, non-string content, or empty
 * content — callers should catch + decide whether to surface a stub
 * fallback.
 */
export async function callOpenRouter(
  env: Env,
  prompt: string,
  options: CallOpenRouterOptions,
): Promise<string> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }
  const model = env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "http-referer": options.referer ?? DEFAULT_REFERRER,
      "x-title": options.title,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: options.maxTokens ?? 1500,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${String(res.status)}: ${await res.text()}`);
  }
  const payload = await res.json<OpenRouterResponse>();
  if (payload.error) {
    throw new Error(`OpenRouter error: ${payload.error.message ?? "unknown"}`);
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("OpenRouter returned empty content");
  }
  return content;
}

/** Resolve the model id the worker would actually invoke. */
export function resolveModelId(env: Env): string {
  return env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
}
