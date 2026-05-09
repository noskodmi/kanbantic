import { statusHandler } from "./api/status.js";
import type { Env } from "./env.js";
import { Router } from "./router.js";

const router = new Router();
router.add({ method: "GET", path: "/api/status", handler: statusHandler });

export default {
  async fetch(request, env, ctx) {
    return router.dispatch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

export { IndexerCursor } from "./indexer/cursor.js";
