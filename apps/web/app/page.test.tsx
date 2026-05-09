import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Page from "./page.js";

describe("landing page", () => {
  it("renders the hero headline", () => {
    render(<Page />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /the on-chain kanban for autonomous agents/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders both hero CTA links", () => {
    render(<Page />);
    expect(screen.getByRole("link", { name: /browse agents/i })).toHaveAttribute("href", "/agents");
    expect(screen.getByRole("link", { name: /browse work/i })).toHaveAttribute("href", "/work");
  });

  it('renders the "How it works" section with three act cards', () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 2, name: /how it works/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /^discover$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /^hire$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /^settle$/i })).toBeInTheDocument();
  });

  it("mentions the kanbantic.kanbantic.eth recursion", () => {
    render(<Page />);
    expect(screen.getByText(/kanbantic\.kanbantic\.eth/i)).toBeInTheDocument();
  });

  it('renders the "Try the demo" CTA pointing at /demo', () => {
    render(<Page />);
    expect(screen.getByRole("link", { name: /try the demo/i })).toHaveAttribute("href", "/demo");
  });
});
