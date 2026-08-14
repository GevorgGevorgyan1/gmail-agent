/* Markdown rendering — lightweight and local, just the subset the answers use:
   bold, code, links, headings, and nested bullets. */

import React from "react";

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]*\]\([^)\s]+\))/g;

// Every link in an answer is a Gmail thread the backend handed the model. The
// prose around it is derived from mail anyone can send you, so a link pointing
// anywhere else did not come from us: render it as text and let it be read, not
// clicked. A prompt asking the model to behave is not a guarantee that it did.
const GMAIL = "https://mail.google.com/";

function parseInline(text, keyBase, strongClass = "font-medium text-ink") {
  const nodes = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyBase}-b-${key++}`} className={strongClass}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${keyBase}-c-${key++}`}
          className="rounded bg-rule-soft px-1.5 py-0.5 font-mono text-[12.5px] text-ink"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);
      nodes.push(
        href.startsWith(GMAIL) ? (
          <a
            key={`${keyBase}-a-${key++}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-ink underline decoration-rule decoration-1 underline-offset-[3px] transition-colors hover:decoration-ink-faint"
          >
            {label}
          </a>
        ) : (
          label
        )
      );
    }
    lastIndex = INLINE.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const BULLET = /^(\s*)[*-] +(.*)$/;

/** Nest by indent: anything deeper than the item above it belongs to that item. */
function renderItems(items, keyBase, depth = 0) {
  const nodes = [];

  for (let i = 0; i < items.length; i++) {
    // Captured before the scan below moves `i` past this item's children.
    const item = items[i];
    const children = [];
    while (i + 1 < items.length && items[i + 1].depth > item.depth) children.push(items[++i]);

    nodes.push(
      <li key={`${keyBase}-${i}`} className="leading-relaxed text-ink-soft">
        {/* A top-level bullet heads an email — its bold date is set in the same
            serif as the page's title, so the eye can find the dates by shape. */}
        {parseInline(
          item.text,
          `${keyBase}-${i}`,
          depth === 0 ? "font-serif text-[19px] font-normal text-ink" : "font-medium text-ink"
        )}
        {children.length > 0 && (
          <ul className="mt-1.5 list-[circle] space-y-1 pl-5 marker:text-rule">
            {renderItems(children, `${keyBase}-${i}-c`, depth + 1)}
          </ul>
        )}
      </li>
    );
  }

  return nodes;
}

export function renderMarkdown(text) {
  const lines = text.split("\n");
  const blocks = [];
  let items = [];

  const flushList = () => {
    if (!items.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-3 list-disc space-y-3 pl-5 marker:text-ink-faint">
        {renderItems(items, `ul-${blocks.length}`)}
      </ul>
    );
    items = [];
  };

  lines.forEach((raw) => {
    const bullet = raw.match(BULLET);
    if (bullet) {
      items.push({ depth: Math.floor(bullet[1].length / 2), text: bullet[2].trim() });
      return;
    }

    // A blank line between bullets is spacing, not the end of the list — the
    // model leaves one between each email, and closing the list there would
    // break one list into several and lose the nesting under each date.
    const line = raw.trim();
    if (!line) return;

    flushList();
    if (line.startsWith("### ")) {
      blocks.push(
        <h3
          key={`h-${blocks.length}`}
          className="mt-6 mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint"
        >
          {parseInline(line.slice(4), `h-${blocks.length}`, "font-medium text-ink-soft")}
        </h3>
      );
    } else {
      blocks.push(
        <p key={`p-${blocks.length}`} className="my-2 leading-relaxed text-ink-soft">
          {parseInline(line, `p-${blocks.length}`)}
        </p>
      );
    }
  });

  flushList();
  return blocks;
}
