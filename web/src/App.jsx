import React, { useState, useRef, useEffect, useCallback } from "react";

import { account, ask } from "./api";

const SUGGESTIONS = [
  "Summarize my important emails today",
  "Which emails need a reply?",
  "What emails did I write last month?",
  "Anything from recruiters this week?",
];

/* ---------------------------------------------------------------
   Icons
--------------------------------------------------------------- */

function LogoIcon({ className }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect x="1" y="1" width="22" height="22" rx="6" fill="#D93025" />
        <path
          d="M6 8.5L12 13L18 8.5"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="6" y="7" width="12" height="10" rx="1.6" stroke="white" strokeWidth="1.6" />
      </svg>
    </div>
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

function SendIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 19V5M12 5L6 11M12 5L18 11"
        stroke="currentColor"
        strokeWidth="2"
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

function SparkAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center shrink-0 border border-red-100">
      <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="#D93025" strokeWidth="1.8" />
        <path d="M4.5 7L12 12.5L19.5 7" stroke="#D93025" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
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

function parseInline(text, keyBase) {
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
        <strong key={`${keyBase}-b-${key++}`} className="font-semibold text-gray-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={`${keyBase}-c-${key++}`} className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-800">
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
            className="font-medium text-red-700 underline decoration-red-200 underline-offset-2 hover:decoration-red-500 transition-colors"
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
      <li key={`${keyBase}-${i}`} className="text-gray-700 leading-relaxed">
        {parseInline(item.text, `${keyBase}-${i}`)}
        {children.length > 0 && (
          <ul className="list-[circle] pl-5 mt-1 space-y-0.5">
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
      <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-2 my-2">
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
        <h3 key={`h-${blocks.length}`} className="text-sm font-semibold text-gray-900 mt-4 mb-1 tracking-wide uppercase">
          {parseInline(line.slice(4), `h-${blocks.length}`)}
        </h3>
      );
    } else {
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-gray-700 leading-relaxed my-1.5">
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
    <div className="flex items-center gap-1 py-2">
      <span className="dot w-1.5 h-1.5 rounded-full bg-gray-300" style={{ animationDelay: "0ms" }} />
      <span className="dot w-1.5 h-1.5 rounded-full bg-gray-300" style={{ animationDelay: "150ms" }} />
      <span className="dot w-1.5 h-1.5 rounded-full bg-gray-300" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

/* ---------------------------------------------------------------
   Message bubble
--------------------------------------------------------------- */

function UserMessage({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] bg-gray-100 text-gray-900 rounded-2xl rounded-tr-md px-4 py-2.5 text-sm leading-relaxed">
        {text}
      </div>
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
      <div className="flex gap-3 items-start">
        <SparkAvatar />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-gray-700 leading-relaxed">
            Something went wrong reaching your inbox.
          </p>
          <p className="mt-1 text-xs text-red-600 font-mono break-words">{message.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-start">
      <SparkAvatar />
      <div className="min-w-0 flex-1 group">
        {message.thinking ? (
          <ThinkingDots />
        ) : (
          <>
            <div className="text-[15px]">{renderMarkdown(message.content)}</div>
            {message.streaming && <span className="stream-cursor" />}
            {settled && message.query && (
              <p className="mt-2 text-xs text-gray-400">
                Searched <code className="font-mono text-gray-500">{message.query}</code> · {message.count}{" "}
                {message.count === 1 ? "email" : "emails"} read
              </p>
            )}
            {settled && (
              <button
                onClick={handleCopy}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-400 opacity-0 group-hover:opacity-100 hover:text-gray-600 transition-opacity"
              >
                <CopyIcon className="w-3.5 h-3.5" />
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Empty state
--------------------------------------------------------------- */

function EmptyState({ onPick }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-12 h-12 mb-5">
        <LogoIcon className="w-12 h-12" />
      </div>
      <h1 className="text-2xl font-medium text-gray-900 mb-1">What would you like to know about your Gmail?</h1>
      <p className="text-sm text-gray-400 mb-8">Ask in plain language — I'll search your inbox and bring back the answer.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left text-sm text-gray-600 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-red-200 hover:bg-red-50/40 hover:text-gray-900 transition-colors"
          >
            {s}
          </button>
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
    <header className="h-14 shrink-0 border-b border-gray-100 flex items-center justify-between px-4 sm:px-6 bg-white/95 z-10">
      <div className="flex items-center gap-2.5">
        <LogoIcon className="w-6 h-6" />
        <span className="text-[15px] font-medium text-gray-900">Gmail Assistant</span>
      </div>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          aria-label="Settings"
        >
          <SettingsIcon className="w-[18px] h-[18px]" />
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 pop-in">
            <div className="px-3.5 py-2.5 border-b border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Connected account</p>
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    mailbox?.email ? "bg-green-500" : mailbox?.error ? "bg-red-500" : "bg-gray-300"
                  }`}
                />
                <span className="text-sm text-gray-800 truncate">
                  {mailbox?.email || (mailbox?.error ? "Not connected" : "Checking…")}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className="w-full text-left px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Clear conversation
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------
   Input bar
--------------------------------------------------------------- */

function InputBar({ value, onChange, onSend, disabled }) {
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

  return (
    <div className="shrink-0 border-t border-gray-100 bg-white px-4 sm:px-6 py-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl px-3.5 py-2.5 focus-within:border-red-300 transition-colors">
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your Gmail…"
            className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none py-1.5 max-h-40 leading-relaxed"
          />
          <button
            onClick={onSend}
            disabled={disabled || !value.trim()}
            className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              value.trim() && !disabled
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-gray-100 text-gray-300"
            }`}
            aria-label="Send message"
          >
            <SendIcon className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-xs text-gray-300 mt-2">
          Gmail Assistant reads your inbox to answer questions. Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </div>
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
        const answer = await ask(trimmed);
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
    setMessages([]);
    setBusy(false);
    setInput("");
  };

  return (
    <div className="h-full w-full flex flex-col bg-white" style={{ fontFamily: "'Google Sans Text','Inter',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      <style>{`
        @keyframes popIn { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes bounceDot { 0%, 60%, 100% { transform: translateY(0); opacity: .4 } 30% { transform: translateY(-3px); opacity: 1 } }
        @keyframes blink { 0%, 50% { opacity: 1 } 51%, 100% { opacity: 0 } }
        .pop-in { animation: popIn 0.15s ease both; }
        .dot { animation: bounceDot 1.2s infinite ease-in-out; }
        .stream-cursor { display: inline-block; width: 2px; height: 14px; background: #D93025; margin-left: 2px; vertical-align: -2px; animation: blink 1s step-start infinite; }
        textarea::-webkit-scrollbar, .msg-scroll::-webkit-scrollbar { width: 6px; }
        .msg-scroll::-webkit-scrollbar-thumb { background: #E8EAED; border-radius: 999px; }
      `}</style>

      <TopBar onClear={clearConversation} />

      {messages.length === 0 ? (
        <EmptyState onPick={send} />
      ) : (
        <div ref={scrollRef} className="msg-scroll flex-1 overflow-y-auto px-4 sm:px-6">
          <div className="max-w-2xl mx-auto py-6 space-y-5">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserMessage key={m.id} text={m.content} />
              ) : (
                <AssistantMessage key={m.id} message={m} />
              )
            )}
          </div>
        </div>
      )}

      <InputBar value={input} onChange={setInput} onSend={() => send(input)} disabled={busy} />
    </div>
  );
}
