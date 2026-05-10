import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sepoliaDeployment } from "@kanbantic/shared";

import { ContractIntelligenceForm } from "./ContractIntelligenceForm.js";
import ContractIntelligenceDashboardPage from "./page.js";

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

const SAMPLE_CONTRACTS = Object.entries(sepoliaDeployment.contracts).map(([name, address]) => ({
  name,
  address,
}));

describe("/dashboard/contract-intelligence — page shell", () => {
  it("renders the runner heading + footer", () => {
    render(<ContractIntelligenceDashboardPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /contract intelligence/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/why contract intelligence/i)).toBeInTheDocument();
  });

  it("seeds the form with the 5 Kanbantic Sepolia contracts as sample buttons", () => {
    render(<ContractIntelligenceDashboardPage />);
    // Should mention every contract name from sepoliaDeployment.
    for (const [name] of Object.entries(sepoliaDeployment.contracts)) {
      expect(screen.getByText(new RegExp(name))).toBeInTheDocument();
    }
  });
});

describe("ContractIntelligenceForm", () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.clearAllMocks();
  });

  it("POSTs to the worker on submit and renders the markdown report", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        kind: "audit",
        address: sepoliaDeployment.contracts.AgentRegistry,
        sourcifyMatch: "exact_match",
        report:
          "# Contract Intelligence — audit report\n\n## Findings (stub)\n\nReal audit lands when AI_GATEWAY_TOKEN env is set.\n",
        sourcifyUrl: `https://sourcify.dev/lookup/${sepoliaDeployment.contracts.AgentRegistry}`,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    render(<ContractIntelligenceForm sampleContracts={SAMPLE_CONTRACTS} />);

    fireEvent.change(screen.getByLabelText(/sepolia contract address/i), {
      target: { value: sepoliaDeployment.contracts.AgentRegistry },
    });
    fireEvent.click(screen.getByRole("button", { name: /run audit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/contract-intelligence\/run$/);
    const rawBody = init.body;
    const bodyText = typeof rawBody === "string" ? rawBody : "";
    const body = JSON.parse(bodyText) as { taskKind: string; address: string };
    expect(body.taskKind).toBe("audit");
    expect(body.address).toBe(sepoliaDeployment.contracts.AgentRegistry);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 3, name: /findings \(stub\)/i }),
      ).toBeInTheDocument();
    });
    // Sourcify deep-link is rendered.
    const link = screen.getByRole("link", { name: /view on sourcify/i });
    expect(link.getAttribute("href")).toContain("sourcify.dev/lookup/");
  });

  it("renders an error envelope when the worker returns not_verified", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        kind: "audit",
        address: "0xdEAD000000000000000000000000000000000000",
        error: "not_verified",
        message: "Address is not verified on Sourcify.",
      }),
    ) as typeof fetch;

    render(<ContractIntelligenceForm sampleContracts={SAMPLE_CONTRACTS} />);
    fireEvent.change(screen.getByLabelText(/sepolia contract address/i), {
      target: { value: "0xdEAD000000000000000000000000000000000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run audit/i }));

    await waitFor(() => {
      expect(screen.getByText(/Address is not verified on Sourcify\./i)).toBeInTheDocument();
    });
  });

  it("clicking a sample contract fills the address input", () => {
    render(<ContractIntelligenceForm sampleContracts={SAMPLE_CONTRACTS} />);
    const target = SAMPLE_CONTRACTS[0];
    if (!target) throw new Error("expected at least one sample contract");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(target.address) }));
    const input = screen.getByLabelText<HTMLInputElement>(/sepolia contract address/i);
    expect(input.value).toBe(target.address);
  });
});
