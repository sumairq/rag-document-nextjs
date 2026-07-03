"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ChatStreamEvent, CitationPayload } from "@/lib/chat/protocol";
import { SourcePanel } from "@/components/source-panel";
import { Composer } from "@/components/composer";
import { useCollections } from "@/components/collection-provider";
import { useConversations } from "@/components/conversations-provider";
import { getConversationAction } from "@/app/actions/conversations";
import Link from "next/link";

import { startersFor } from "@/lib/starter-prompts";
import { DocumentStack } from "@/components/document-stack";
import { HowItWorks } from "@/components/how-it-works";
import { buttonClassName } from "@/components/ui/button";
import { PlusIcon, SparkIcon } from "@/components/ui/icons";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitationPayload[];
  /** False when the answer wasn't in the documents (honest refusal). */
  answerable?: boolean;
  /** Set on the assistant message when the request failed. */
  error?: boolean;
}

type OpenSource = { chunkId: string; quote: string };

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

export function Chat() {
  const router = useRouter();
  const { selected, selectedId, setSelectedId } = useCollections();
  const { activeId, refresh } = useConversations();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [openSource, setOpenSource] = useState<OpenSource | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  // The conversation id that `messages` currently represents. A ref (not state)
  // so we can compare against the URL without re-triggering the load effect.
  const loadedIdRef = useRef<string | null>(null);

  // Load / reset the thread when the selected conversation (?c=) changes.
  // Guarded so that navigating to a thread we just created (first send) doesn't
  // refetch it. All setState happens inside the async callback (never the
  // effect body) to avoid cascading-render lint.
  useEffect(() => {
    if (activeId === loadedIdRef.current) return;
    let cancelled = false;
    const load = activeId
      ? getConversationAction(activeId)
      : Promise.resolve(null);

    load.then((detail) => {
      if (cancelled) return;
      if (!activeId) {
        loadedIdRef.current = null;
        setMessages([]);
        return;
      }
      if (detail) {
        loadedIdRef.current = detail.conversation.id;
        setMessages(
          detail.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            citations: m.citations ?? undefined,
            answerable: (m.citations?.length ?? 0) > 0 ? true : undefined,
          })),
        );
        // A thread is scoped to one corpus; make that corpus active so the
        // sidebar list and header reflect where we are.
        if (detail.conversation.collectionId !== selectedId) {
          setSelectedId(detail.conversation.collectionId);
        }
      } else {
        // Stale / deleted id — fall back to a fresh chat.
        loadedIdRef.current = null;
        setMessages([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeId, selectedId, setSelectedId]);

  // Keep the latest message in view as tokens stream in.
  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const patchMessage = (id: string, patch: Partial<Message>) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  const appendToMessage = (id: string, text: string) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: m.content + text } : m)),
    );

  async function sendQuestion(text: string) {
    const question = text.trim();
    if (!question || isStreaming || !selectedId) return;

    const userMessage: Message = { id: newId(), role: "user", content: question };
    const assistantId = newId();
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          collectionId: selectedId,
          conversationId: loadedIdRef.current ?? undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status}).`);
      }

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
            // Adopt the (possibly new) thread id and reflect it in the URL
            // without a remount, then refresh the sidebar list.
            if (loadedIdRef.current !== event.conversationId) {
              loadedIdRef.current = event.conversationId;
              refresh();
              router.replace(`/?c=${event.conversationId}`, { scroll: false });
            }
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      patchMessage(assistantId, { content: message, error: true });
    } finally {
      setIsStreaming(false);
    }
  }

  const starters = startersFor(selected?.slug);
  const showWelcome = !activeId && messages.length === 0;
  const showLoading = !!activeId && messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[var(--reading-width)] flex-col px-4 py-8 sm:px-6">
          {showWelcome && (
            <Welcome
              corpusName={selected?.name ?? null}
              starters={starters}
              onPick={sendQuestion}
              disabled={isStreaming || !selectedId}
            />
          )}

          {showLoading && (
            <div className="flex justify-center pt-20 text-sm text-faint">
              Loading conversation…
            </div>
          )}

          {messages.length > 0 && (
            <div className="flex flex-col gap-8">
              {messages.map((m, i) => (
                <MessageView
                  key={m.id}
                  message={m}
                  streaming={
                    isStreaming &&
                    m.role === "assistant" &&
                    i === messages.length - 1
                  }
                  onOpenSource={setOpenSource}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <SourcePanel
        chunkId={openSource?.chunkId ?? null}
        quote={openSource?.quote ?? ""}
        onClose={() => setOpenSource(null)}
      />

      <Composer
        onSend={sendQuestion}
        disabled={isStreaming || !selectedId}
        placeholder={
          selectedId
            ? `Ask about ${selected?.name ?? "this corpus"}…`
            : "Select a corpus to begin…"
        }
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Welcome / empty state
 * ------------------------------------------------------------------------ */
function Welcome({
  corpusName,
  starters,
  onPick,
  disabled,
}: {
  corpusName: string | null;
  starters: string[];
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
      style={{
        backgroundImage:
          "radial-gradient(46% 40% at 50% 48%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 72%)",
      }}
    >
      <div className="flex flex-col items-center gap-5">
        <DocumentStack />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">
            {corpusName ? `Ask ${corpusName}` : "Ask your documents"}
          </h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted">
            {corpusName
              ? "Grounded answers only from the documents in this corpus and cites every source it uses. When the answer isn’t in them, it tells you plainly instead of guessing."
              : "You don’t have a corpus yet. Add your documents to start asking questions, with citations back to the source."}
          </p>
        </div>
        {corpusName && <HowItWorks />}
      </div>

      {!corpusName && (
        <Link
          href="/corpus"
          className={buttonClassName({ variant: "primary", size: "md" })}
        >
          <PlusIcon />
          Add documents
        </Link>
      )}

      {starters.length > 0 && (
        <div className="flex w-full max-w-md flex-col gap-2 pt-2">
          <p className="text-[11px] font-medium tracking-wide text-faint uppercase">
            Try asking
          </p>
          {starters.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPick(prompt)}
              disabled={disabled}
              className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left text-sm text-foreground shadow-xs transition-colors hover:border-accent/40 hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:opacity-50"
            >
              <SparkIcon className="shrink-0 text-faint transition-colors group-hover:text-accent" />
              <span className="min-w-0">{prompt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Messages
 * ------------------------------------------------------------------------ */
function MessageView({
  message,
  streaming,
  onOpenSource,
}: {
  message: Message;
  streaming: boolean;
  onOpenSource: (s: OpenSource) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-border bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  // Error
  if (message.error) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">
        <WarnIcon />
        <span>{message.content}</span>
      </div>
    );
  }

  // Honest "not in the documents"
  if (message.answerable === false) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3.5 text-[15px] leading-relaxed text-muted">
        <span className="mt-0.5 shrink-0 text-faint">
          <InfoIcon />
        </span>
        <span className="whitespace-pre-wrap">{message.content}</span>
      </div>
    );
  }

  const citations = message.citations
    ? [...message.citations].sort((a, b) => a.marker - b.marker)
    : [];

  return (
    <div>
      <div className="text-answer whitespace-pre-wrap text-foreground">
        {message.content}
        {streaming && !message.content && <ThinkingDots />}
        {streaming && message.content && (
          <span className="ml-0.5 inline-block h-[1.05em] w-[2px] -mb-0.5 animate-pulse bg-muted align-middle" />
        )}
        {/* Inline citation markers, trailing the answer prose */}
        {!streaming && citations.length > 0 && (
          <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
            {citations.map((c) => (
              <button
                key={`m-${c.chunkId}`}
                onClick={() =>
                  onOpenSource({ chunkId: c.chunkId, quote: c.quote })
                }
                aria-label={`Open source ${c.marker}`}
                className="inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-[6px] bg-accent-subtle px-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
              >
                {c.marker}
              </button>
            ))}
          </span>
        )}
      </div>

      {!streaming && citations.length > 0 && (
        <SourceList citations={citations} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

function SourceList({
  citations,
  onOpenSource,
}: {
  citations: CitationPayload[];
  onOpenSource: (s: OpenSource) => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      <p className="text-[11px] font-semibold tracking-wide text-faint uppercase">
        Sources
      </p>
      {citations.map((c) => (
        <button
          key={c.chunkId}
          onClick={() => onOpenSource({ chunkId: c.chunkId, quote: c.quote })}
          className="group flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left shadow-xs transition-colors hover:border-accent/50 hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
        >
          <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-[11px] font-semibold text-accent group-hover:bg-accent group-hover:text-accent-fg">
            {c.marker}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-foreground">
              {c.documentFilename}
              {c.page != null && (
                <span className="font-normal text-faint"> · p.{c.page}</span>
              )}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted">
              {c.snippet}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 align-middle text-faint">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 7.25v3.25M8 5.4h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="mt-0.5 shrink-0"
    >
      <path
        d="M8 2.75 14 13H2L8 2.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.75v2.5M8 11.2h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
