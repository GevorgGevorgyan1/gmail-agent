import React, { useState } from "react";

import { renderMarkdown } from "../markdown";
import { CopyIcon } from "./Icons";

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="dot h-1.5 w-1.5 rounded-full bg-ink-faint" style={{ animationDelay: "0ms" }} />
      <span className="dot h-1.5 w-1.5 rounded-full bg-ink-faint" style={{ animationDelay: "150ms" }} />
      <span className="dot h-1.5 w-1.5 rounded-full bg-ink-faint" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

export function UserMessage({ text }) {
  return (
    <div className="flex items-baseline gap-3 border-t border-rule-soft pt-9 first:border-0 first:pt-0">
      <span className="select-none font-mono text-sm text-ink-faint">&gt;</span>
      <p className="text-[17px] font-medium leading-snug text-ink">{text}</p>
    </div>
  );
}

export function AssistantMessage({ message }) {
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
