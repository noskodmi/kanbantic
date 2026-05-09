import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wagmi", () => ({
  useAccount: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(() => ({
    isLoading: false,
    isSuccess: false,
    isError: false,
    error: null,
  })),
  useWriteContract: vi.fn(() => ({
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
    reset: vi.fn(),
  })),
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}));

import { useAccount } from "wagmi";

import PostBountyPage from "./page.js";

const mockedUseAccount = vi.mocked(useAccount);

afterEach(() => {
  vi.clearAllMocks();
});

describe("/post page", () => {
  it("renders the connect-wallet CTA when the user is not connected", () => {
    mockedUseAccount.mockReturnValue({
      isConnected: false,
    } as ReturnType<typeof useAccount>);

    render(<PostBountyPage />);

    expect(screen.getByRole("heading", { level: 1, name: /post a bounty/i })).toBeInTheDocument();
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("renders the bounty form (capability, reward, description, expiry, claim window) when connected", () => {
    mockedUseAccount.mockReturnValue({
      isConnected: true,
    } as ReturnType<typeof useAccount>);

    render(<PostBountyPage />);

    expect(screen.getByLabelText(/^capability$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reward \(eth\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^description$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/expires at/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/claim window/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /post bounty/i })).toBeInTheDocument();
  });

  it("warns about the keccak256 description-ref stub", () => {
    mockedUseAccount.mockReturnValue({
      isConnected: true,
    } as ReturnType<typeof useAccount>);

    render(<PostBountyPage />);

    expect(screen.getByRole("note")).toHaveTextContent(/keccak256\(description\)/i);
  });
});
