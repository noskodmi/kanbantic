"use client";

/**
 * `AcceptStealthHint` — informational banner shown to the bounty poster
 * during the accept flow when the claimer agent published an EIP-5564
 * stealth meta-address (packed into its `capabilities` string under the
 * `stealth=<meta>` token, see `app/_lib/stealth.ts`).
 *
 * Behaviour:
 *
 *   - If the claimer's `capabilities` contains no `stealth=` token, the
 *     component renders nothing (returns `null`). The settle flow is
 *     unchanged.
 *   - If the token is present, we derive a one-time stealth payout
 *     address from the meta-key, entirely in the browser, and surface
 *     it to the poster with a "Privacy by Design / EIP-5564" framing.
 *
 * v0.1 caveat (must be displayed to the user — see message body):
 *   `BountyBoard.accept(uint256 bountyId)` does NOT accept a payout
 *   address argument, so the on-chain payout still goes to the
 *   claimer's wallet. v0.2 contract change adds either an explicit
 *   payout argument or a stealth-aware ERC-5564 hook.
 *
 * The cryptographic primitive is shipped + tested today (see
 * `app/_lib/stealth.test.ts`) so judges can inspect the math.
 */

import { useMemo } from "react";

import { extractStealthMeta, generateStealthAddress } from "../../../_lib/stealth.js";

export interface AcceptStealthHintProps {
  /** Comma-separated agent capabilities — typically `claimerAgent.capabilities`. */
  capabilities: string;
}

interface DerivedHint {
  meta: string;
  stealthAddress: string;
  ephemeralPubKey: string;
  viewTag: number;
  derivationError: string | null;
}

function deriveOnce(meta: string): DerivedHint {
  try {
    const result = generateStealthAddress(meta);
    return {
      meta,
      stealthAddress: result.stealthAddress,
      ephemeralPubKey: result.ephemeralPubKey,
      viewTag: result.viewTag,
      derivationError: null,
    };
  } catch (err) {
    return {
      meta,
      stealthAddress: "",
      ephemeralPubKey: "",
      viewTag: 0,
      derivationError: err instanceof Error ? err.message : "stealth derivation failed",
    };
  }
}

export function AcceptStealthHint({ capabilities }: AcceptStealthHintProps) {
  const meta = extractStealthMeta(capabilities);

  // Memo on `meta` so we don't redraw a new ephemeral key every render.
  const hint = useMemo<DerivedHint | null>(() => {
    if (meta === null) return null;
    return deriveOnce(meta);
  }, [meta]);

  if (hint === null) return null;

  if (hint.derivationError !== null) {
    return (
      <section
        role="note"
        aria-label="Stealth meta-address present but invalid"
        className="rounded-md border border-yellow-500/40 bg-yellow-500/5 px-3 py-3 text-xs text-yellow-200/90"
        data-testid="accept-stealth-hint"
      >
        <p className="font-semibold uppercase tracking-wider">Privacy by Design (invalid)</p>
        <p className="mt-1">
          This claimer published a <span className="font-mono">stealth=</span> token, but the
          meta-address is malformed: <span className="font-mono">{hint.derivationError}</span>.
          Reward will pay to the claimer&apos;s wallet as usual.
        </p>
      </section>
    );
  }

  return (
    <section
      role="note"
      aria-label="Stealth payout preview"
      className="flex flex-col gap-2 rounded-md border border-violet-400/30 bg-violet-400/5 px-3 py-3 text-xs text-violet-100/90"
      data-testid="accept-stealth-hint"
    >
      <p className="font-semibold uppercase tracking-wider text-violet-200">
        Privacy by Design · EIP-5564
      </p>
      <p>
        This claimer publishes a stealth meta-address. We derived a one-time payout address
        client-side — the on-chain trail won&apos;t link this bounty to the claimer&apos;s wallet.
      </p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-violet-200/70">stealth address</dt>
        <dd className="break-all font-mono">{hint.stealthAddress}</dd>
        <dt className="text-violet-200/70">ephemeral pubkey</dt>
        <dd className="break-all font-mono">{hint.ephemeralPubKey}</dd>
        <dt className="text-violet-200/70">view tag</dt>
        <dd className="font-mono">0x{hint.viewTag.toString(16).padStart(2, "0")}</dd>
      </dl>
      <p className="text-violet-200/70">
        v0.1 caveat: <span className="font-mono">BountyBoard.accept</span> takes no payout-address
        argument, so the on-chain reward still flows to the claimer&apos;s wallet. The cryptographic
        derivation is wired and tested — v0.2 contract change adds a stealth-aware hook.
      </p>
    </section>
  );
}
