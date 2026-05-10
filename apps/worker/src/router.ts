import type { Env } from "./env.js";

export interface RouteContext {
  /** Path parameters extracted from a route pattern. Empty for exact-match routes. */
  params: Record<string, string>;
}

export type RouteHandler = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  routeCtx: RouteContext,
) => Promise<Response>;

export interface Route {
  method: "GET" | "POST" | "OPTIONS";
  /** Exact path or pattern with `:name` placeholders. */
  path: string;
  handler: RouteHandler;
}

interface CompiledRoute extends Route {
  paramNames: string[];
  pattern: RegExp | null;
}

/**
 * Permissive CORS so the web frontend at kanbantic.vercel.app (and any
 * other origin) can call the worker from a browser. The worker exposes
 * read-only public data + paywalled write endpoints — none of which
 * carry per-origin secrets, so wildcard is appropriate.
 */
const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-payment",
  "access-control-expose-headers": "x-payment-receipt, x-payment-address",
  "access-control-max-age": "86400",
};

function withCors(response: Response): Response {
  // Mutate the response headers in-place. Response is mutable; this avoids
  // re-streaming the body just to wrap it.
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    response.headers.set(k, v);
  }
  return response;
}

export class Router {
  private readonly routes: CompiledRoute[] = [];

  add(route: Route): this {
    this.routes.push(compile(route));
    return this;
  }

  async dispatch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // Global OPTIONS preflight: respond immediately with CORS headers
    // for any path. Individual handlers can still register OPTIONS
    // routes for special cases (e.g. /mcp), and those will be tried
    // before this fallback because we scan registered routes first.
    if (request.method === "OPTIONS") {
      const matched = this.routes.find(
        (r) => r.method === "OPTIONS" && match(r, url.pathname) !== null,
      );
      if (!matched) {
        return withCors(new Response(null, { status: 204 }));
      }
    }
    for (const route of this.routes) {
      if (route.method !== request.method) continue;
      const params = match(route, url.pathname);
      if (params === null) continue;
      try {
        return withCors(await route.handler(request, env, ctx, { params }));
      } catch (err) {
        console.error("router handler error", err);
        return withCors(new Response("internal error", { status: 500 }));
      }
    }
    return withCors(new Response("not found", { status: 404 }));
  }
}

function compile(route: Route): CompiledRoute {
  if (!route.path.includes(":")) {
    return { ...route, paramNames: [], pattern: null };
  }
  const paramNames: string[] = [];
  const escaped = route.path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { ...route, paramNames, pattern: new RegExp(`^${escaped}$`) };
}

function match(route: CompiledRoute, pathname: string): Record<string, string> | null {
  if (!route.pattern) {
    return route.path === pathname ? {} : null;
  }
  const m = route.pattern.exec(pathname);
  if (!m) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < route.paramNames.length; i++) {
    const name = route.paramNames[i];
    const value = m[i + 1];
    if (name && value !== undefined) {
      params[name] = decodeURIComponent(value);
    }
  }
  return params;
}
