"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatStreamEvent, CitationPayload } from "@/lib/chat/protocol";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
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

  async function sendQuestion() {
    const question = input.trim();
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
        body: JSON.stringify({ question }),
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h1 className="text-sm font-semibold tracking-tight">RAG Chat</h1>
        <p className="text-xs text-zinc-500">
          Answers come only from your ingested documents, with citations.
        </p>
      </header>

      <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {messages.length === 0 && (
            <p className="mt-12 text-center text-sm text-zinc-400">
              Ask a question about your documents to get started.
            </p>
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
            />
          ))}
        </div>
      </div>

      <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask a question…"
            disabled={isStreaming}
            className="flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            onClick={() => void sendQuestion()}
            disabled={!canSend}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
}: {
  message: Message;
  streaming: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={isUser ? "max-w-[85%]" : "w-full"}>
        <div
          className={
            isUser
              ? "rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
              : message.error
                ? "rounded-2xl border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                : "rounded-2xl bg-zinc-100 px-4 py-2 text-sm whitespace-pre-wrap text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
          }
        >
          {message.content || (streaming ? "" : " ")}
          {/* Show a blinking caret while the answer is still streaming and empty. */}
          {streaming && !message.content && (
            <span className="text-zinc-400">Thinking…</span>
          )}
          {streaming && message.content && (
            <span className="ml-0.5 inline-block animate-pulse">▍</span>
          )}
        </div>

        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            <p className="text-xs font-medium text-zinc-500">Citations</p>
            {message.citations.map((c) => (
              <div
                key={c.chunkId}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="font-medium text-zinc-700 dark:text-zinc-300">
                  [{c.marker}] {c.documentFilename}
                  <span className="font-normal text-zinc-400">
                    {" "}
                    · chunk {c.chunkIndex}
                    {c.page != null ? ` · p.${c.page}` : ""} · score{" "}
                    {c.similarity.toFixed(3)}
                  </span>
                </div>
                <p className="mt-1 text-zinc-500">{c.snippet}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
