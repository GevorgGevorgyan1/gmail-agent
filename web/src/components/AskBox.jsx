import React, { useRef, useEffect } from "react";

import { ArrowUpIcon } from "./Icons";

export function AskBox({ value, onChange, onSend, disabled, placeholder, autoFocus }) {
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
