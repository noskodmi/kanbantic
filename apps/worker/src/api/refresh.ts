import type { Env } from "../env.js";

export async function refreshHandler(_request: Request, env: Env): Promise<Response> {
  const id = env.INDEXER.idFromName("singleton");
  const stub = env.INDEXER.get(id);
  const tickRes = await stub.fetch("https://internal/tick");
  const body = await tickRes.json<{ from: number; to: number; logs: number }>();
  return Response.json(body);
}
