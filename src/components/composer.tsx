"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ArrowUpIcon } from "@/components/ui/icons";

/**
 * The message composer: an auto-growing textarea framed as one focus-ring
 * surface with the send affordance inside it (not a bare input beside a grey
 * button). Owns its own draft text; sends via `onSend`.
 */
export function Composer({
  onSend,
  disabled,
  placeholder = "Ask a question about this corpus…",
}: {
  onSend: (text: string) => void;
  /** True while a response is streaming, or when no corpus is available. */
  disabled: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !disabled;

  function resetHeight() {
    if (ref.current) ref.current.style.height = "auto";
  }

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    resetHeight();
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
      <div className="mx-auto w-full max-w-[var(--reading-width)]">
        <div className="flex items-end gap-2 rounded-xl border border-border-strong bg-surface p-1.5 shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={onInput}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2.5 py-1.5 text-[15px] leading-6 text-foreground outline-none placeholder:text-faint disabled:opacity-60"
          />
          <Button
            variant="primary"
            size="icon"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send message"
            className="h-9 w-9 rounded-lg"
          >
            <ArrowUpIcon />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-faint">
          <span className="font-medium text-muted">Enter</span> to send ·{" "}
          <span className="font-medium text-muted">Shift+Enter</span> for a new
          line
        </p>
      </div>
    </div>
  );
}
