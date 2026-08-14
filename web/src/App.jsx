import React, { useState, useRef, useEffect, useCallback } from "react";

import { account, ask, clearSession } from "./api";

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

/* ---------------------------------------------------------------
   Icons
--------------------------------------------------------------- */

function PromptMark({ className }) {
  return (
    <div className={`flex items-center justify-center rounded-md bg-ink text-paper ${className}`}>
      <span className="font-mono text-[11px] font-medium leading-none tracking-tighter">&gt;_</span>
    </div>
  );
}

function LockIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ArrowUpIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 19V6M12 6L6.5 11.5M12 6l5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 15V6a2 2 0 012-2h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------------------------------------------------------
   Markdown rendering (lightweight, local)
--------------------------------------------------------------- */

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

/* ---------------------------------------------------------------
   Typing / thinking indicator
--------------------------------------------------------------- */

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="dot h-1.5 w-1.5 rounded-full bg-ink-faint" style={{ animationDelay: "0ms" }} />
      <span className="dot h-1.5 w-1.5 rounded-full bg-ink-faint" style={{ animationDelay: "150ms" }} />
      <span className="dot h-1.5 w-1.5 rounded-full bg-ink-faint" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

/* ---------------------------------------------------------------
   Turns
--------------------------------------------------------------- */

function UserMessage({ text }) {
  return (
    <div className="flex items-baseline gap-3 border-t border-rule-soft pt-9 first:border-0 first:pt-0">
      <span className="select-none font-mono text-sm text-ink-faint">&gt;</span>
      <p className="text-[17px] font-medium leading-snug text-ink">{text}</p>
    </div>
  );
}

function AssistantMessage({ message }) {
  const [copied, setCopied] = useState(false);
  const settled = !message.thinking && !message.streaming;

  const handleCopy = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(message.fullContent || message.content).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (message.error) {
    return (
      <div className="pl-7">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Something went wrong reaching your inbox.
        </p>
        <p className="mt-1.5 break-words font-mono text-xs text-[#a4483c]">{message.error}</p>
      </div>
    );
  }

  return (
    <div className="group pl-7 text-[15px]">
      {message.thinking ? (
        <ThinkingDots />
      ) : (
        <>
          <div>{renderMarkdown(message.content)}</div>
          {message.streaming && <span className="stream-cursor" />}
          {settled && message.query && (
            <p className="mt-5 font-mono text-[11px] leading-relaxed text-ink-faint">
              searched <span className="text-ink-soft">{message.query}</span> · {message.count}{" "}
              {message.count === 1 ? "email" : "emails"} read
            </p>
          )}
          {settled && (
            <button
              onClick={handleCopy}
              className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-faint opacity-0 transition-opacity hover:text-ink-soft group-hover:opacity-100"
            >
              <CopyIcon className="h-3.5 w-3.5" />
              {copied ? "copied" : "copy"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   Ask box
--------------------------------------------------------------- */

function AskBox({ value, onChange, onSend, disabled, placeholder, autoFocus }) {
  const taRef = useRef(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [value]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const ready = value.trim() && !disabled;

  return (
    <div className="flex items-end gap-2 rounded-[26px] border border-rule bg-paper-raised py-2 pl-5 pr-2 transition-colors focus-within:border-ink-faint">
      <textarea
        ref={taRef}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
      />
      <button
        onClick={onSend}
        disabled={!ready}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          ready
            ? "bg-ink text-paper hover:bg-ink-soft"
            : "border border-rule text-ink-faint"
        }`}
        aria-label="Send message"
      >
        <ArrowUpIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------
   Landing
--------------------------------------------------------------- */

function Landing({ input, setInput, onSend, onPick, busy }) {
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

/* ---------------------------------------------------------------
   Top bar
--------------------------------------------------------------- */

function TopBar({ onClear }) {
  const [open, setOpen] = useState(false);
  const [mailbox, setMailbox] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    account()
      .then((data) => setMailbox({ email: data.email }))
      .catch((error) => setMailbox({ error: error.message }));
  }, []);

  return (
    <header className="z-10 shrink-0 border-b border-rule-soft">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <PromptMark className="h-7 w-7" />
          <span className="font-mono text-sm font-medium tracking-tight text-ink">gmail-agent</span>
          <span className="hidden rounded border border-rule px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint sm:inline">
            In development
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-1.5 font-mono text-xs text-ink-soft sm:flex">
            <LockIcon className="h-3.5 w-3.5" />
            gmail.readonly
          </span>

          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="rounded-full p-1.5 text-ink-faint transition-colors hover:bg-rule-soft hover:text-ink-soft"
              aria-label="Settings"
            >
              <SettingsIcon className="h-[17px] w-[17px]" />
            </button>
            {open && (
              <div className="pop-in absolute right-0 mt-2 w-64 rounded-xl border border-rule bg-paper-raised py-1.5 shadow-[0_8px_24px_-12px_rgba(44,61,68,0.25)]">
                <div className="border-b border-rule-soft px-4 py-3">
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                    Connected account
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        mailbox?.email
                          ? "bg-emerald-600"
                          : mailbox?.error
                            ? "bg-[#a4483c]"
                            : "bg-rule"
                      }`}
                    />
                    <span className="truncate font-mono text-xs text-ink">
                      {mailbox?.email || (mailbox?.error ? "not connected" : "checking…")}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onClear();
                    setOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-ink-soft transition-colors hover:bg-rule-soft/60 hover:text-ink"
                >
                  Clear conversation
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------
   App
--------------------------------------------------------------- */

let idCounter = 0;
const nextId = () => `m-${++idCounter}-${Date.now()}`;

const STREAM_TICK = 12;   // ms between frames
const STREAM_TARGET = 1800; // aim to finish typing within this, however long the answer

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const streamTimer = useRef(null);
  // Names this conversation for the server, which keeps the history behind it.
  const sessionId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => () => clearInterval(streamTimer.current), []);

  const streamAssistantMessage = useCallback((id, answer) => {
    const { text } = answer;
    // A real digest can run long; scale the step so typing never outlasts its welcome.
    const step = Math.max(3, Math.ceil(text.length / (STREAM_TARGET / STREAM_TICK)));
    let i = 0;

    clearInterval(streamTimer.current);
    streamTimer.current = setInterval(() => {
      i += step;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, thinking: false, content: text.slice(0, i), streaming: i < text.length }
            : m
        )
      );
      if (i >= text.length) {
        clearInterval(streamTimer.current);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  content: text,
                  fullContent: text,
                  streaming: false,
                  query: answer.query,
                  count: answer.count,
                }
              : m
          )
        );
        setBusy(false);
      }
    }, STREAM_TICK);
  }, []);

  const send = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const userMsg = { id: nextId(), role: "user", content: trimmed };
      const assistantId = nextId();
      const assistantMsg = { id: assistantId, role: "assistant", content: "", thinking: true };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setBusy(true);

      try {
        const answer = await ask(trimmed, sessionId.current);
        streamAssistantMessage(assistantId, answer);
      } catch (error) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, thinking: false, error: error.message } : m
          )
        );
        setBusy(false);
      }
    },
    [busy, streamAssistantMessage]
  );

  const clearConversation = () => {
    clearInterval(streamTimer.current);
    // Drop the server's copy too, then start a fresh conversation either way —
    // a failed cleanup should not leave the user staring at a stale transcript.
    clearSession(sessionId.current).catch(() => {});
    sessionId.current = crypto.randomUUID();
    setMessages([]);
    setBusy(false);
    setInput("");
  };

  const started = messages.length > 0;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-paper">
      <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-64" />

      <TopBar onClear={clearConversation} />

      <div ref={scrollRef} className="msg-scroll relative flex-1 overflow-y-auto">
        {started ? (
          <div className="mx-auto w-full max-w-3xl space-y-5 px-6 py-10">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserMessage key={m.id} text={m.content} />
              ) : (
                <AssistantMessage key={m.id} message={m} />
              )
            )}
          </div>
        ) : (
          <Landing
            input={input}
            setInput={setInput}
            onSend={() => send(input)}
            onPick={send}
            busy={busy}
          />
        )}
      </div>

      {started && (
        <div className="relative shrink-0 border-t border-rule-soft bg-paper px-6 py-4">
          <div className="mx-auto w-full max-w-3xl">
            <AskBox
              value={input}
              onChange={setInput}
              onSend={() => send(input)}
              disabled={busy}
              placeholder="Ask a follow-up…"
            />
            <p className="mt-2.5 text-center font-mono text-[10px] text-ink-faint">
              read-only access · enter to send · shift+enter for a new line
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
