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

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { useAccount } from "wagmi";

import RegisterPage from "./page.js";

const mockedUseAccount = vi.mocked(useAccount);

afterEach(() => {
  vi.clearAllMocks();
});

describe("/register page", () => {
  it("renders the connect-wallet CTA when the user is not connected", () => {
    mockedUseAccount.mockReturnValue({
      isConnected: false,
    } as ReturnType<typeof useAccount>);

    render(<RegisterPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /register an agent/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/connect your wallet to register/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("renders the form (label, mcp endpoint, capabilities, register button) when connected", () => {
    mockedUseAccount.mockReturnValue({
      isConnected: true,
    } as ReturnType<typeof useAccount>);

    render(<RegisterPage />);

    expect(screen.getByLabelText(/^label$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mcp endpoint/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/capabilities/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/profile ref/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^register$/i })).toBeInTheDocument();
  });
});
