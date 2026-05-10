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

export class Router {
  private readonly routes: CompiledRoute[] = [];

  add(route: Route): this {
    this.routes.push(compile(route));
    return this;
  }

  async dispatch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    for (const route of this.routes) {
      if (route.method !== request.method) continue;
      const params = match(route, url.pathname);
      if (params === null) continue;
      try {
        return await route.handler(request, env, ctx, { params });
      } catch (err) {
        console.error("router handler error", err);
        return new Response("internal error", { status: 500 });
      }
    }
    return new Response("not found", { status: 404 });
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
