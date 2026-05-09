/**
 * Kanbantic API worker. Phase 0 ships only a `/hello` smoke endpoint that
 * proves Wrangler + the workspace wiring is functional. Phase 2 lands the
 * D1 indexer, MCP server, Swarm proxy, and Apify webhook receiver.
 */
export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname === "/hello") {
      return new Response("hello kanbantic", {
        headers: { "content-type": "text/plain" },
      });
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler;
