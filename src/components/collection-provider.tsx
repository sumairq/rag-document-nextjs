"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import type { CollectionSummary } from "@/lib/chat/protocol";

const STORAGE_KEY = "selectedCollectionId";

interface CollectionContextValue {
  collections: CollectionSummary[];
  selectedId: string | null;
  selected: CollectionSummary | null;
  setSelectedId: (id: string) => void;
  /** Trigger a re-fetch of collections (after upload/delete/create). */
  refresh: () => void;
  loading: boolean;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch collections on mount and whenever refresh() bumps reloadKey. setState
  // only runs in the async callbacks, so we never setState synchronously in the
  // effect body.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/collections")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const cols: CollectionSummary[] = data.collections ?? [];
        const stored = readStored();
        setCollections(cols);
        setSelectedIdState((prev) => {
          if (prev && cols.some((c) => c.id === prev)) return prev;
          if (stored && cols.some((c) => c.id === stored)) return stored;
          return cols[0]?.id ?? null;
        });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const setSelectedId = useCallback((id: string) => {
    setSelectedIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const selected = collections.find((c) => c.id === selectedId) ?? null;

  return (
    <CollectionContext.Provider
      value={{ collections, selectedId, selected, setSelectedId, refresh, loading }}
    >
      {children}
    </CollectionContext.Provider>
  );
}

export function useCollections(): CollectionContextValue {
  const ctx = useContext(CollectionContext);
  if (!ctx) {
    throw new Error("useCollections must be used within a CollectionProvider.");
  }
  return ctx;
}
