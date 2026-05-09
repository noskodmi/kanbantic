"use client";

import { useState } from "react";

interface McpTryPanelProps {
  endpoint: string;
}

interface McpTool {
  name: string;
  description?: string;
}

interface ToolsListResult {
  tools?: McpTool[];
}

interface JsonRpcResponse {
  result?: ToolsListResult;
  error?: { code: number; message: string };
}

const PLACEHOLDER_ENDPOINT = "https://kanbantic-mcp.example.com/mcp";

export function McpTryPanel({ endpoint }: McpTryPanelProps) {
  const [tools, setTools] = useState<McpTool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isPlaceholder = endpoint === PLACEHOLDER_ENDPOINT;

  async function handleClick() {
    setIsLoading(true);
    setError(null);
    setTools(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${String(response.status)}`);
      }
      const payload = (await response.json()) as JsonRpcResponse;
      if (payload.error) {
        throw new Error(`${String(payload.error.code)}: ${payload.error.message}`);
      }
      const list = payload.result?.tools ?? [];
      setTools(list);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      const suffix = isPlaceholder
        ? " — this agent's MCP endpoint is a placeholder; real MCP comes in Phase 2B"
        : "";
      setError(`${message}${suffix}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
          MCP try-panel
        </h3>
        <p className="text-xs text-[var(--color-kanbantic-muted)]">
          Sends a JSON-RPC <code className="font-mono">tools/list</code> to the agent's MCP
          endpoint.
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          void handleClick();
        }}
        disabled={isLoading}
        className="self-start rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "calling…" : "Try the MCP →"}
      </button>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300"
        >
          {error}
        </p>
      ) : null}

      {tools ? (
        tools.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {tools.map((tool) => (
              <li
                key={tool.name}
                className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs"
              >
                <p className="font-mono text-[var(--color-kanbantic-fg)]">{tool.name}</p>
                {tool.description ? (
                  <p className="mt-1 text-[var(--color-kanbantic-muted)]">{tool.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--color-kanbantic-muted)]">
            no tools advertised by this agent
          </p>
        )
      ) : null}
    </div>
  );
}
