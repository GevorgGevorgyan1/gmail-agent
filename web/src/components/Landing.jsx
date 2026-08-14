import React from "react";

import { AskBox } from "./AskBox";

const SUGGESTIONS = [
  "did I ever write to arman",
  "unread from this week",
  "what did stripe charge me last month",
  "who is waiting on a reply from me",
];

const FEATURES = [
  {
    label: "Smart search",
    body: "The agent runs Gmail searches for you, refining its query until it finds the right messages.",
  },
  {
    label: "Cited answers",
    body: "Every answer links straight to the threads it came from, one click away in Gmail.",
  },
  {
    label: "Read-only by design",
    body: "A restricted scope means nothing can be sent, deleted, or modified — ever.",
  },
];

export function Landing({ input, setInput, onSend, onPick, busy }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-24 pt-14 sm:pt-20">
      <h1 className="font-serif text-[3.25rem] leading-[1.06] tracking-[-0.015em] text-ink sm:text-[4rem]">
        Ask your inbox
        <br />
        in plain language.
      </h1>

      <p className="mt-8 max-w-xl text-[15px] leading-[1.75] text-ink-soft">
        Gmail Agent reads your inbox and answers in plain language. Ask about any conversation,
        contact, or date range and get a clear summary — with direct links to the original
        threads, so you always land on the real message. Read-only by design, so your mail stays
        exactly as you left it.
      </p>

      <div className="mt-10">
        <AskBox
          value={input}
          onChange={setInput}
          onSend={onSend}
          disabled={busy}
          autoFocus
          placeholder="Ask your inbox — e.g. did I ever write to arman"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-rule bg-paper-raised px-4 py-1.5 font-mono text-xs text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.label} className="rounded-xl border border-rule bg-paper-raised p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              {feature.label}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{feature.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
