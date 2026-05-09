import type { NextConfig } from "next";

interface WebpackResolve {
  extensionAlias?: Record<string, string[]>;
}

interface WebpackConfigShape {
  resolve: WebpackResolve;
}

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@kanbantic/shared", "@kanbantic/ui"],
  typedRoutes: true,
  // The `@kanbantic/shared` workspace package compiles from `.ts` source but
  // uses NodeNext-style `.js` import specifiers (required so `tsc` can emit
  // valid ESM). Webpack supports remapping `.js` → `.ts` via `extensionAlias`,
  // but Turbopack (the default Next 16 bundler) does not yet expose that hook.
  // Until upstream lands the Turbopack equivalent, we explicitly opt into the
  // webpack production build (`next build --webpack`) so workspace-package
  // value-imports (e.g. `sepoliaDeployment` from `@kanbantic/shared`) bundle.
  webpack: (webpackConfig: unknown) => {
    const cfg = webpackConfig as WebpackConfigShape;
    cfg.resolve.extensionAlias = {
      ...(cfg.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return cfg;
  },
};

export default config;
