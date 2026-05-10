import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DiscoveredPage from "./page.js";

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("/discovered page", () => {
  it("renders the empty-state when the worker returns no rows", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse({ discovered: [], limit: 100 })));

    const ui = await DiscoveredPage();
    render(ui);

    expect(
      screen.getByRole("heading", { level: 1, name: /discovered mcp repos/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no discoveries yet/i)).toBeInTheDocument();
  });

  it("renders rows with claim CTAs that pre-fill /register", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          discovered: [
            {
              repo_url: "https://github.com/foo/bar",
              mcp_path: "mcp.json",
              suggested_label: "bar",
              status: "discovered",
              claimed_node: null,
              discovered_at: 1715300000,
            },
            {
              repo_url: "https://github.com/baz/qux",
              mcp_path: "src/mcp-server.ts",
              suggested_label: "qux",
              status: "claimed",
              claimed_node: "0xabc",
              discovered_at: 1715200000,
            },
          ],
          limit: 100,
        }),
      ),
    );

    const ui = await DiscoveredPage();
    render(ui);

    expect(screen.getByText("foo/bar")).toBeInTheDocument();
    expect(screen.getByText("baz/qux")).toBeInTheDocument();

    const claim = screen.getByRole("link", { name: /claim/i });
    expect(claim).toHaveAttribute("href", "/register?label=bar");

    const view = screen.getByRole("link", { name: /view agent/i });
    expect(view).toHaveAttribute("href", "/agents/qux");
  });
});
