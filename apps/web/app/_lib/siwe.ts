"use client";

/**
 * Client-side SIWE (EIP-4361) flow against the Kanbantic worker.
 *
 *   1. POST /api/siwe/nonce            → { nonce }
 *   2. Build EIP-4361 message + sign with the connected wallet
 *   3. POST /api/siwe/verify { message, signature }
 *                                     → { token, address, expiresAt }
 *   4. Cache `{ address, token, expiresAt }` in sessionStorage so the
 *      same browser tab can re-use the session for the 24-hour TTL
 *      without prompting on every write.
 *
 * The token is the raw `Authorization: Bearer …` value the worker's
 * `requireSiwe` guard expects.
 */

import { useCallback, useState } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";

const WORKER_BASE = "https://kanbantic-api.lizzflix.workers.dev";
// Must match wrangler.jsonc env.SIWE_DOMAIN.
const SIWE_DOMAIN = "kanbantic-api.lizzflix.workers.dev";
const SIWE_URI = `https://${SIWE_DOMAIN}`;
const STORAGE_KEY = "kanbantic.siwe";

interface CachedSession {
  address: string;
  token: string;
  expiresAt: number;
}

function readCached(address: string): CachedSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSession;
    const now = Math.floor(Date.now() / 1000);
    if (
      parsed.address.toLowerCase() === address.toLowerCase() &&
      typeof parsed.token === "string" &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt - 60 > now
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCached(session: CachedSession): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function buildSiweMessage(args: {
  address: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    `${SIWE_DOMAIN} wants you to sign in with your Ethereum account:`,
    args.address,
    "",
    "Sign in to upload to Swarm and run agents on Kanbantic.",
    "",
    `URI: ${SIWE_URI}`,
    `Version: 1`,
    `Chain ID: ${String(args.chainId)}`,
    `Nonce: ${args.nonce}`,
    `Issued At: ${args.issuedAt}`,
  ].join("\n");
}

export interface SiweSession {
  address: string;
  token: string;
}

export interface UseSiweResult {
  /** Acquire a session JWT, prompting the wallet if cached one is missing/expired. */
  ensureSession: () => Promise<SiweSession>;
  isSigning: boolean;
  /** Last error from the SIWE flow, if any. */
  error: string | null;
}

export function useSiwe(): UseSiweResult {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureSession = useCallback(async (): Promise<SiweSession> => {
    setError(null);
    if (!address) {
      throw new Error("No wallet connected.");
    }
    const cached = readCached(address);
    if (cached !== null) {
      return { address: cached.address, token: cached.token };
    }
    setIsSigning(true);
    try {
      const nonceRes = await fetch(`${WORKER_BASE}/api/siwe/nonce`, { method: "POST" });
      if (!nonceRes.ok) throw new Error(`SIWE nonce: HTTP ${String(nonceRes.status)}`);
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const message = buildSiweMessage({
        address,
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
      });

      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch(`${WORKER_BASE}/api/siwe/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) {
        const detail = await verifyRes.text().catch(() => "");
        throw new Error(`SIWE verify: HTTP ${String(verifyRes.status)} ${detail.slice(0, 120)}`);
      }
      const verified = (await verifyRes.json()) as {
        token: string;
        address: string;
        expiresAt: number;
      };
      writeCached(verified);
      return { address: verified.address, token: verified.token };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setIsSigning(false);
    }
  }, [address, chainId, signMessageAsync]);

  return { ensureSession, isSigning, error };
}

/**
 * Upload raw bytes (≤ 4 KB) to Swarm via the worker, returning the
 * BMT keccak256 root. Caller must pass an active SIWE token.
 */
export async function uploadToSwarm(args: { token: string; bytes: Uint8Array }): Promise<{
  ref: `0x${string}`;
  mode: "gateway" | "local";
  size: number;
}> {
  // BodyInit accepts BufferSource, but Uint8Array is parameterised over
  // ArrayBufferLike in lib.dom.d.ts; cast to BlobPart-friendly Blob to
  // dodge the variance check while keeping the binary payload intact.
  const blob = new Blob([args.bytes as BlobPart], { type: "application/octet-stream" });
  const res = await fetch(`${WORKER_BASE}/api/upload`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.token}`,
      "content-type": "application/octet-stream",
    },
    body: blob,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Swarm upload: HTTP ${String(res.status)} ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as { ref: `0x${string}`; mode: "gateway" | "local"; size: number };
}
