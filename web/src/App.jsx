import React, { useState, useRef, useEffect, useCallback } from "react";

import { ask, clearSession } from "./api";
import { AskBox } from "./components/AskBox";
import { Landing } from "./components/Landing";
import { AssistantMessage, UserMessage } from "./components/Message";
import { TopBar } from "./components/TopBar";

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
