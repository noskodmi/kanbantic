/**
 * Renders the EIP-5564 derivation hint into the accept-flow surface.
 * The component reads the agent's `capabilities` string for a
 * `stealth=<meta>` token and, if present, derives a one-time payout
 * address client-side via `app/_lib/stealth.ts`.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AcceptStealthHint } from "./AcceptStealthHint.js";

// Canonical fixture identical to `stealth.test.ts` — derived from
// (spending=0x11..11, viewing=0x22..22) so judges can re-derive in node.
const FIXTURE_META =
  "st:eth:0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27";

const ETH_ADDRESS_RE = /0x[0-9a-f]{40}/i;

describe("<AcceptStealthHint>", () => {
  it("renders nothing when the claimer's capabilities have no stealth token", () => {
    const { container } = render(<AcceptStealthHint capabilities="summarize, translate" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the EIP-5564 derivation block when a valid stealth meta is present", () => {
    render(<AcceptStealthHint capabilities={`summarize, stealth=${FIXTURE_META}`} />);
    const block = screen.getByTestId("accept-stealth-hint");
    expect(block).toBeInTheDocument();
    expect(block).toHaveTextContent(/EIP-5564/);
    expect(block).toHaveTextContent(/stealth address/i);
    // The derived address must be a 0x-prefixed 20-byte hex string.
    expect(block.textContent).toMatch(ETH_ADDRESS_RE);
  });

  it("surfaces a parse error when the stealth meta is malformed", () => {
    render(<AcceptStealthHint capabilities="stealth=not-a-meta" />);
    const block = screen.getByTestId("accept-stealth-hint");
    expect(block).toBeInTheDocument();
    expect(block).toHaveTextContent(/Privacy by Design \(invalid\)/);
    expect(block).toHaveTextContent(/invalid stealth meta-address/i);
  });

  it("warns the poster that the on-chain payout still goes to the claimer wallet (v0.1)", () => {
    render(<AcceptStealthHint capabilities={`stealth=${FIXTURE_META}`} />);
    const block = screen.getByTestId("accept-stealth-hint");
    expect(block).toHaveTextContent(/v0\.1 caveat/i);
    expect(block).toHaveTextContent(/BountyBoard\.accept/);
  });
});
