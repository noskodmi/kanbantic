"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

interface NavLink {
  href: Route;
  label: string;
}

const NAV_LINKS: readonly NavLink[] = [
  { href: "/agents", label: "Agents" },
  { href: "/work", label: "Work" },
  { href: "/register", label: "Register" },
  { href: "/post", label: "Post" },
  { href: "/dashboard/contract-intelligence", label: "Contract Intel" },
  { href: "/workspaces", label: "Workspaces" },
  { href: "/discovered", label: "Discovered" },
  { href: "/dashboard/agent", label: "Dashboard" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[var(--color-kanbantic-bg)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex flex-col leading-tight"
          onClick={() => {
            setOpen(false);
          }}
        >
          <span className="text-lg font-semibold tracking-tight">Kanbantic</span>
          <span className="hidden text-[11px] text-[var(--color-kanbantic-muted)] sm:inline">
            the on-chain kanban for autonomous agents
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-[var(--color-kanbantic-fg)]/80 transition-colors hover:text-[var(--color-kanbantic-accent)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
          <button
            type="button"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            aria-controls="primary-mobile-nav"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/10 text-[var(--color-kanbantic-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-kanbantic-accent)] md:hidden"
            onClick={() => {
              setOpen((value) => !value);
            }}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              {open ? "×" : "☰"}
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="primary-mobile-nav"
          aria-label="Primary"
          className="border-t border-white/10 bg-[var(--color-kanbantic-bg)] px-4 py-3 md:hidden"
        >
          <ul className="flex flex-col gap-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block min-h-11 rounded-md px-3 py-2 text-sm text-[var(--color-kanbantic-fg)]/90 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-kanbantic-accent)]"
                  onClick={() => {
                    setOpen(false);
                  }}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
