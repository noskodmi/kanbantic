/**
 * GitHub Code Search query builders + result parsers for the Kanbantic
 * Apify discoverer Actor.
 *
 * GitHub Code Search ref:
 * https://docs.github.com/en/rest/search/search#search-code
 *
 * Rate limits:
 * - Unauthenticated: ~10 req/min, capped at the first 1k results.
 * - With a token: ~30 req/min for code search.
 *
 * The two patterns we look for cover the dominant MCP server styles:
 * - `mcp.json`             — the canonical static MCP descriptor
 * - `mcp-server.{ts,py}`   — the conventional entry-point filename
 */

export interface GithubCodeSearchItem {
  name: string;
  path: string;
  repository: {
    full_name: string;
    html_url: string;
  };
}

export interface GithubCodeSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GithubCodeSearchItem[];
}

const GITHUB_API = "https://api.github.com";

/**
 * Build the query-string URL for a single Code Search query.
 *
 * Exported so the unit test can pin the exact URL the Actor calls.
 */
export function buildCodeSearchUrl(query: string, perPage: number, page: number): string {
  const params = new URLSearchParams({
    q: query,
    per_page: String(perPage),
    page: String(page),
  });
  return `${GITHUB_API}/search/code?${params.toString()}`;
}

/** The two MCP signatures we scan for, in priority order. */
export const MCP_QUERIES: readonly string[] = [
  "filename:mcp.json language:json",
  "path:mcp-server.ts",
  "path:mcp-server.py",
];

/**
 * Compute a Kanbantic ENS label from a repo's `full_name` (`<owner>/<repo>`).
 *
 * Rules:
 * - Lowercase
 * - Drop dots (ENS spec splits on dots, so a label can't contain one)
 * - Replace runs of `_`/`/`/whitespace with `-`
 * - Strip anything outside `[a-z0-9-]`
 * - Collapse multiple `-` and trim leading/trailing `-`
 *
 * If the result is empty (e.g. the repo name was all-symbol) the
 * caller should skip the record — there's no valid label to suggest.
 */
export function suggestLabel(fullName: string): string {
  const repo = fullName.split("/").pop() ?? fullName;
  const lower = repo.toLowerCase();
  const noDots = lower.replace(/\./g, "");
  const dashed = noDots.replace(/[_\s/]+/g, "-");
  const cleaned = dashed.replace(/[^a-z0-9-]/g, "");
  const collapsed = cleaned.replace(/-+/g, "-");
  return collapsed.replace(/^-+|-+$/g, "");
}

export interface DiscoveredRecord {
  repo_url: string;
  mcp_path: string;
  suggested_label: string;
  discovered_at: number;
}

export interface FetchOptions {
  /** Optional GitHub PAT — improves rate limit + result quality. */
  token?: string;
  /** Max records returned across all queries. */
  limit: number;
  /** Override fetcher for tests. */
  fetcher?: typeof fetch;
}

/**
 * Run all `MCP_QUERIES` until either the per-page cap is exhausted
 * or `limit` records have been collected. Dedupes by `repo_url`.
 *
 * Returns records ready to POST to the worker webhook.
 */
export async function discoverMcpRepos(options: FetchOptions): Promise<DiscoveredRecord[]> {
  const fetcher = options.fetcher ?? fetch;
  const seen = new Map<string, DiscoveredRecord>();
  const perPage = Math.min(options.limit, 100);
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "kanbantic-apify-discoverer",
  };
  if (options.token) {
    headers["authorization"] = `Bearer ${options.token}`;
  }

  const now = Math.floor(Date.now() / 1000);

  for (const query of MCP_QUERIES) {
    if (seen.size >= options.limit) break;
    const url = buildCodeSearchUrl(query, perPage, 1);
    const res = await fetcher(url, { headers });
    if (!res.ok) {
      console.warn(`github code search failed: ${query} → ${String(res.status)}`);
      continue;
    }
    const payload = (await res.json()) as GithubCodeSearchResponse;
    for (const item of payload.items) {
      if (seen.size >= options.limit) break;
      const repoUrl = item.repository.html_url;
      if (seen.has(repoUrl)) continue;
      const label = suggestLabel(item.repository.full_name);
      if (!label) continue;
      seen.set(repoUrl, {
        repo_url: repoUrl,
        mcp_path: item.path,
        suggested_label: label,
        discovered_at: now,
      });
    }
  }

  return Array.from(seen.values());
}
