"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useCollections } from "@/components/collection-provider";
import { useConversations } from "@/components/conversations-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  ChevronDownIcon,
  CloseIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/ui/icons";

/**
 * The persistent left rail: brand, New chat, the corpus selector that scopes
 * the list, the conversation list (newest-active first, active highlighted,
 * inline delete-with-confirm), and a quiet footer. Rendered both as the fixed
 * desktop sidebar and inside the mobile drawer.
 */
export function Sidebar({
  onNavigate,
  onClose,
}: {
  /** Called after any navigation, so the mobile drawer can close itself. */
  onNavigate?: () => void;
  /** When provided (mobile drawer), shows a close affordance in the header. */
  onClose?: () => void;
}) {
  const router = useRouter();
  const { collections, selectedId, setSelectedId, loading } = useCollections();
  const { conversations, activeId, remove } = useConversations();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const go = (href: string) => {
    router.push(href);
    onNavigate?.();
  };

  function onNewChat() {
    setConfirmingId(null);
    go("/");
  }

  function onChangeCorpus(id: string) {
    // A thread is scoped to one corpus, so switching corpus starts a fresh chat
    // in that corpus and re-scopes the list below.
    setSelectedId(id);
    setConfirmingId(null);
    go("/");
  }

  async function onDelete(id: string) {
    await remove(id);
    setConfirmingId(null);
    // If we deleted the thread we're viewing, fall back to a fresh chat.
    if (id === activeId) go("/");
  }

  return (
    <div className="flex h-full w-[var(--sidebar-width)] flex-col border-r border-border bg-surface">
      {/* Brand */}
      <div className="flex h-[var(--header-height)] items-center justify-between px-3">
        <Link
          href="/"
          onClick={() => onNavigate?.()}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[13px] font-bold text-accent-fg">
            R
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            Grounded
          </span>
        </Link>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close menu"
          >
            <CloseIcon />
          </Button>
        )}
      </div>

      {/* New chat */}
      <div className="px-3 pb-3">
        <Button
          variant="primary"
          size="md"
          onClick={onNewChat}
          className="w-full justify-start"
        >
          <PlusIcon />
          New chat
        </Button>
      </div>

      {/* Corpus selector — scopes the list beneath it */}
      <div className="px-3 pb-2">
        <label className="mb-1.5 block px-1 text-[11px] font-medium tracking-wide text-faint uppercase">
          Corpus
        </label>
        <div className="relative">
          <select
            value={selectedId ?? ""}
            onChange={(e) => onChangeCorpus(e.target.value)}
            disabled={loading || collections.length === 0}
            className="w-full cursor-pointer appearance-none rounded-md border border-border-strong bg-surface py-2 pr-8 pl-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
          >
            {collections.length === 0 && <option value="">No corpora</option>}
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.documentCount}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-faint" />
        </div>
      </div>

      {/* Conversation list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <p className="px-1 pb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">
          Conversations
        </p>
        {conversations.length === 0 ? (
          <p className="px-1 py-6 text-[13px] leading-relaxed text-faint">
            No conversations yet in this corpus. Start one with{" "}
            <span className="font-medium text-muted">New chat</span>.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {conversations.map((c) => {
              const active = c.id === activeId;
              const confirming = c.id === confirmingId;
              return (
                <li key={c.id} className="group relative">
                  {confirming ? (
                    <div className="flex items-center gap-1.5 rounded-md bg-danger-subtle px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-danger">
                        Delete this chat?
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => onDelete(c.id)}
                      >
                        Delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Link
                        href={`/?c=${c.id}`}
                        onClick={() => onNavigate?.()}
                        className={cn(
                          "flex items-center rounded-md py-1.5 pr-8 pl-2.5 text-[13px] transition-colors",
                          active
                            ? "bg-surface-3 font-medium text-foreground"
                            : "text-muted hover:bg-surface-2 hover:text-foreground",
                        )}
                      >
                        <span className="truncate">{c.title}</span>
                      </Link>
                      <button
                        onClick={() => setConfirmingId(c.id)}
                        aria-label="Delete conversation"
                        className={cn(
                          "absolute top-1/2 right-1 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-faint opacity-0 transition-colors hover:bg-surface-3 hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 group-hover:opacity-100",
                          active && "opacity-100",
                        )}
                      >
                        <TrashIcon width={14} height={14} />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Quiet footer */}
      <div className="border-t border-border px-4 py-3">
        <p className="text-[11px] leading-relaxed text-faint">
          Answers are grounded in your corpus, with citations back to the source.
        </p>
      </div>
    </div>
  );
}
