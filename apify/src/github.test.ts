import { describe, expect, it } from "vitest";

import { buildCodeSearchUrl, MCP_QUERIES, suggestLabel } from "./github.js";

describe("buildCodeSearchUrl", () => {
  it("encodes the query, per_page, and page", () => {
    const url = buildCodeSearchUrl("filename:mcp.json language:json", 30, 1);
    expect(url).toBe(
      "https://api.github.com/search/code?q=filename%3Amcp.json+language%3Ajson&per_page=30&page=1",
    );
  });

  it("renders the canonical mcp-server.ts query", () => {
    const url = buildCodeSearchUrl(MCP_QUERIES[1] ?? "", 10, 2);
    expect(url).toBe(
      "https://api.github.com/search/code?q=path%3Amcp-server.ts&per_page=10&page=2",
    );
  });
});

describe("suggestLabel", () => {
  it("lowercases the repo name", () => {
    expect(suggestLabel("foo/MCP-Server")).toBe("mcp-server");
  });
  it("strips dots", () => {
    expect(suggestLabel("foo/my.mcp.server")).toBe("mymcpserver");
  });
  it("converts underscores and slashes to dashes", () => {
    expect(suggestLabel("foo/my_mcp")).toBe("my-mcp");
  });
  it("trims edge dashes", () => {
    expect(suggestLabel("foo/-weird--name-")).toBe("weird-name");
  });
  it("returns empty string when nothing valid remains", () => {
    expect(suggestLabel("foo/!!!")).toBe("");
  });
});
