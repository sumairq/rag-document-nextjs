"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatStreamEvent, CitationPayload } from "@/lib/chat/protocol";
import { SourcePanel } from "@/components/source-panel";
import { useCollections } from "@/components/collection-provider";
import { startersFor } from "@/lib/starter-prompts";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitationPayload[];
  answerable?: boolean;
  /** Set on the assistant message when the request failed. */
  error?: boolean;
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

export function Chat() {
  const { selectedId, selected } = useCollections();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [openSource, setOpenSource] = useState<{
    chunkId: string;
    quote: string;
  } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view as tokens stream in.
  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Append text to a specific assistant message (used per streamed token).
  const appendToMessage = (id: string, text: string) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + text } : m)),
    );

  const patchMessage = (id: string, patch: Partial<Message>) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );

  async function sendQuestion(text?: string) {
    const question = (text ?? input).trim();
    if (!question || isStreaming) return;

    const userMessage: Message = {
      id: newId(),
      role: "user",
      content: question,
    };
    const assistantId = newId();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, collectionId: selectedId ?? undefined }),
      });

      // Non-streaming error responses (validation, engine failure) are JSON.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status}).`);
      }

      // Read the NDJSON stream: decode bytes, split on newlines, parse events.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;

          const event = JSON.parse(line) as ChatStreamEvent;
          if (event.type === "token") {
            appendToMessage(assistantId, event.value);
          } else if (event.type === "done") {
            patchMessage(assistantId, {
              answerable: event.answerable,
              citations: event.citations,
            });
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      patchMessage(assistantId, {
        content: message,
        error: true,
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter for a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendQuestion();
    }
  }

  const canSend = input.trim().length > 0 && !isStreaming;
  const starters = startersFor(selected?.slug);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h1 className="text-sm font-semibold tracking-tight">
          {selected ? selected.name : "RAG Chat"}
        </h1>
        <p className="text-xs text-zinc-500">
          {selected
            ? `Answering only from “${selected.name}” (${selected.documentCount} document${selected.documentCount === 1 ? "" : "s"}), with citations.`
            : "Answers come only from your ingested documents, with citations."}
        </p>
      </header>

      <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {messages.length === 0 && (
            <div className="mt-16 flex flex-col items-center gap-4 text-center">
              {starters.length > 0 ? (
                <>
                  <div className="flex flex-col items-center gap-1">
                    <h2 className="text-lg font-semibold tracking-tight">
                      Ask {selected ? `“${selected.name}”` : "your documents"}
                    </h2>
                    <p className="text-[13px] text-zinc-500">
                      Try one of these to get started
                    </p>
                  </div>
                  <div className="flex flex-col items-stretch gap-2">
                    {starters.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => void sendQuestion(prompt)}
                        disabled={isStreaming}
                        className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-700 transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-accent dark:hover:text-accent"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-zinc-500">
                  Ask a question about your documents to get started.
                </p>
              )}
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              streaming={
                isStreaming &&
                m.role === "assistant" &&
                m.id === messages[messages.length - 1]?.id
              }
              onOpenSource={setOpenSource}
            />
          ))}
        </div>
      </div>

      <SourcePanel
        chunkId={openSource?.chunkId ?? null}
        quote={openSource?.quote ?? ""}
        onClose={() => setOpenSource(null)}
      />

      <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask a question…"
            disabled={isStreaming}
            className="flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            onClick={() => void sendQuestion()}
            disabled={!canSend}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {isStreaming ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
  onOpenSource,
}: {
  message: Message;
  streaming: boolean;
  onOpenSource: (source: { chunkId: string; quote: string }) => void;
}) {
  const isUser = message.role === "user";

  // User questions stay a small right-aligned pill; the assistant answer is
  // rendered as plain prose in the column so the *answer* is the visual anchor.
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {message.error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {message.content}
        </div>
      ) : (
        <div className="text-[16px] leading-7 whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">
          {message.content}
          {/* Streaming indicators: pulsing dots before the first token, then a
              slim blinking caret trailing the text as it grows. */}
          {streaming && !message.content && <ThinkingDots />}
          {streaming && message.content && (
            <span className="ml-0.5 inline-block h-[1.1em] w-[2px] -mb-0.5 animate-pulse bg-zinc-500 align-middle" />
          )}
        </div>
      )}

      {message.citations && message.citations.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">
            Sources
          </p>
          {message.citations.map((c) => (
            <button
              key={c.chunkId}
              onClick={() => onOpenSource({ chunkId: c.chunkId, quote: c.quote })}
              className="group flex items-start gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-accent/60 hover:bg-accent/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-accent/60 dark:hover:bg-accent/10"
            >
              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent/10 text-[11px] font-semibold text-accent">
                {c.marker}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                  {c.documentFilename}
                  {c.page != null && (
                    <span className="font-normal text-zinc-400"> · p.{c.page}</span>
                  )}
                </span>
                <span className="mt-0.5 block line-clamp-2 text-xs text-zinc-500">
                  {c.snippet}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Three pulsing dots shown while the answer is still being generated. */
function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 align-middle text-zinc-400">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}
