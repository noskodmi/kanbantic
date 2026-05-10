/**
 * Tiny markdown to React renderer. Hand-rolled (~50 LOC) because the
 * web app doesn't pull `react-markdown`. Handles only the subset the
 * Contract Intelligence reports emit: H1/H2/H3, fenced code blocks
 * (triple-backtick), inline `code`, **bold**, and paragraphs.
 *
 * No HTML escaping needed since we render via React (text nodes are
 * inherently escaped).
 */

import { Fragment, type JSX, type ReactNode } from "react";

/** Render `**bold**` and `code` inside a single text line. */
function renderInline(text: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("`")) {
      tokens.push(
        <code
          key={`c${String(key++)}`}
          className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      tokens.push(
        <strong key={`b${String(key++)}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

interface MarkdownProps {
  source: string;
}

export function Markdown({ source }: MarkdownProps): JSX.Element {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Fenced code block (triple-backtick).
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing fence.
      blocks.push(
        <pre
          key={`code${String(key++)}`}
          className="overflow-x-auto rounded-md border border-white/10 bg-black/40 p-3 text-xs"
          data-lang={lang || undefined}
        >
          <code className="font-mono whitespace-pre">{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Headings.
    if (line.startsWith("### ")) {
      blocks.push(
        <h4 key={`h${String(key++)}`} className="mt-3 text-base font-semibold">
          {renderInline(line.slice(4))}
        </h4>,
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(
        <h3 key={`h${String(key++)}`} className="mt-4 text-lg font-semibold tracking-tight">
          {renderInline(line.slice(3))}
        </h3>,
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(
        <h2 key={`h${String(key++)}`} className="mt-2 text-xl font-bold tracking-tight">
          {renderInline(line.slice(2))}
        </h2>,
      );
      i++;
      continue;
    }

    // Blank line — paragraph separator.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: collect contiguous non-blank, non-block lines.
    const para: string[] = [];
    while (i < lines.length) {
      const cur = lines[i] ?? "";
      if (cur.trim() === "") break;
      if (cur.startsWith("```") || cur.startsWith("#")) break;
      para.push(cur);
      i++;
    }
    blocks.push(
      <p key={`p${String(key++)}`} className="text-sm leading-relaxed">
        {para.map((segment, idx) => (
          <Fragment key={idx}>
            {idx > 0 ? " " : null}
            {renderInline(segment)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <div className="flex flex-col gap-2">{blocks}</div>;
}
