import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("kanbantic-api worker", () => {
  it("returns hello on GET /hello", async () => {
    const response = await SELF.fetch("https://example.com/hello");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello kanbantic");
  });

  it("returns 404 for unknown routes", async () => {
    const response = await SELF.fetch("https://example.com/missing");
    expect(response.status).toBe(404);
  });
});
