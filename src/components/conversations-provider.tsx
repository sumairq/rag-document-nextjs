"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

import { useCollections } from "@/components/collection-provider";
import {
  deleteConversationAction,
  listConversationsAction,
} from "@/app/actions/conversations";
import type { ConversationSummary } from "@/lib/chat/protocol";

/**
 * Owns the conversation list for the active corpus and the currently-open
 * thread id. This is the ONLY component that reads `?c=` from the URL, so it's
 * the single thing that needs a Suspense boundary (see the root layout). The
 * URL is the source of truth for selection — no localStorage stopgap.
 */
interface ConversationsContextValue {
  /** Threads for the active corpus, newest-active first. */
  conversations: ConversationSummary[];
  /** The open thread's id (from `?c=`), or null on a fresh chat. */
  activeId: string | null;
  loading: boolean;
  /** Re-fetch the list (after a send creates a thread, or a rename). */
  refresh: () => void;
  /** Delete a thread and refresh the list. */
  remove: (id: string) => Promise<void>;
}

const ConversationsContext = createContext<ConversationsContextValue | null>(
  null,
);

export function ConversationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { selectedId } = useCollections();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch the list whenever the corpus changes or refresh() bumps reloadKey.
  // setState runs only inside the async callback, never in the effect body.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    listConversationsAction(selectedId)
      .then((rows) => {
        if (cancelled) return;
        setConversations(rows);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const remove = useCallback(async (id: string) => {
    await deleteConversationAction(id);
    // Drop it locally right away, then reconcile with a re-fetch.
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <ConversationsContext.Provider
      value={{ conversations, activeId, loading, refresh, remove }}
    >
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations(): ConversationsContextValue {
  const ctx = useContext(ConversationsContext);
  if (!ctx) {
    throw new Error(
      "useConversations must be used within a ConversationsProvider.",
    );
  }
  return ctx;
}
