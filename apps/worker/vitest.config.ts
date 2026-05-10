import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Test-only secrets. The Apify webhook test suite needs a
          // shared HMAC secret to mint signatures with — wrangler.jsonc
          // intentionally does NOT pin one (production wires it via
          // `wrangler secret put APIFY_WEBHOOK_SECRET`). Tests that
          // exercise the 503 / unset path delete the binding at runtime.
          bindings: {
            APIFY_WEBHOOK_SECRET: "test-secret-do-not-deploy",
          },
        },
      },
    },
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
