"use client";

import { RainbowKitProvider, connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  base,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";

// WalletConnect projectId — required for the WC modal handshake.
const wcProjectId = process.env["NEXT_PUBLIC_WC_PROJECT_ID"];
if (!wcProjectId || wcProjectId === "demo") {
  console.error(
    "[kanbantic] NEXT_PUBLIC_WC_PROJECT_ID is missing — WalletConnect-based wallets (mobile/QR) will not work. Set it in Vercel env.",
  );
}

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [base, metaMaskWallet],
    },
    {
      groupName: "Browser extension",
      wallets: [injectedWallet],
    },
    {
      groupName: "Mobile",
      wallets: [walletConnectWallet, rainbowWallet],
    },
  ],
  {
    appName: "Kanbantic",
    appDescription: "On-chain kanban for autonomous agents.",
    appUrl: "https://kanbantic.vercel.app",
    appIcon: "https://kanbantic.vercel.app/logo.svg",
    projectId: wcProjectId ?? "demo",
    walletConnectParameters: {
      // Safari/ITP-friendly defaults. `disableProviderPing` skips the
      // keepalive that occasionally hangs when third-party storage is
      // blocked; `telemetryEnabled: false` mutes the analytics ping.
      disableProviderPing: true,
      telemetryEnabled: false,
    },
  },
);

// Build a Sepolia transport that prefers the Alchemy RPC when an
// `NEXT_PUBLIC_ALCHEMY_API_KEY` is present, then a custom URL via
// `NEXT_PUBLIC_SEPOLIA_RPC_URL`, then the chain's default public RPC
// (publicnode). Public RPCs rate-limit aggressively and have lossy
// log support, so any real workflow should use the Alchemy path.
const alchemyKey = process.env["NEXT_PUBLIC_ALCHEMY_API_KEY"];
const customRpc = process.env["NEXT_PUBLIC_SEPOLIA_RPC_URL"];
const sepoliaRpcUrl =
  alchemyKey !== undefined && alchemyKey.length > 0
    ? `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`
    : customRpc !== undefined && customRpc.length > 0
      ? customRpc
      : undefined;

const wagmiConfig = createConfig({
  connectors,
  chains: [sepolia],
  transports: { [sepolia.id]: http(sepoliaRpcUrl) },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
