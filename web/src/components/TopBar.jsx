import React, { useState, useRef, useEffect } from "react";

import { account } from "../api";
import { PromptMark, LockIcon, SettingsIcon } from "./Icons";

export function TopBar({ onClear }) {
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
