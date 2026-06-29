"use client";

import { useEffect, useState } from "react";

import type { SourceResolution } from "@/lib/chat/protocol";

interface SourcePanelProps {
  /** Chunk id to resolve, or null when the panel is closed. */
  chunkId: string | null;
  /** Verbatim passage to highlight within the chunk (from the citation). */
  quote: string;
  onClose: () => void;
}

/** Locate `quote` within `text`, tolerating whitespace differences (the model
 * may collapse newlines). Returns the [start, end) span, or null if not found. */
function locateQuote(
  text: string,
  quote: string,
): { start: number; end: number } | null {
  const q = quote.trim();
  if (!q) return null;

  const exact = text.indexOf(q);
  if (exact !== -1) return { start: exact, end: exact + q.length };

  // Whitespace-tolerant: match the quote's words separated by any whitespace.
  const pattern = q
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  try {
    const match = new RegExp(pattern).exec(text);
    if (match) return { start: match.index, end: match.index + match[0].length };
  } catch {
    // Bad regex (shouldn't happen after escaping) — fall through.
  }
  return null;
}

/** Resolved result tagged with the chunk it belongs to, so we can tell whether
 * it matches the currently-open citation. */
type Resolved =
  | { forChunkId: string; status: "loaded"; source: SourceResolution }
  | { forChunkId: string; status: "error"; message: string };

export function SourcePanel({ chunkId, quote, onClose }: SourcePanelProps) {
  const [resolved, setResolved] = useState<Resolved | null>(null);

  // Fetch the source whenever a citation is opened. We only setState inside the
  // async callbacks (never synchronously in the effect body); the "loading"
  // state is derived below from whether `resolved` matches the open chunk.
  useEffect(() => {
    if (!chunkId) return;

    let cancelled = false;
    fetch(`/api/sources/${chunkId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? `Failed to load source (${res.status}).`);
        }
        return (await res.json()) as SourceResolution;
      })
      .then((source) => {
        if (!cancelled) setResolved({ forChunkId: chunkId, status: "loaded", source });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResolved({
            forChunkId: chunkId,
            status: "error",
            message: err instanceof Error ? err.message : "Failed to load source.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chunkId]);

  // Close on Escape.
  useEffect(() => {
    if (!chunkId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chunkId, onClose]);

  if (!chunkId) return null;

  // Derived view state: if the resolved data isn't for the open chunk yet,
  // we're still loading.
  const current = resolved?.forChunkId === chunkId ? resolved : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-start justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold">Source</h2>
            {current?.status === "loaded" && (
              <p className="text-xs text-zinc-500">
                {current.source.documentFilename} · chunk{" "}
                {current.source.chunkIndex}
                {current.source.page != null ? ` · p.${current.source.page}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
            aria-label="Close source panel"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 text-sm leading-relaxed">
          {!current && <p className="text-zinc-400">Loading source…</p>}

          {current?.status === "error" && (
            <p className="text-red-600 dark:text-red-400">{current.message}</p>
          )}

          {current?.status === "loaded" && (
            <ChunkText source={current.source} quote={quote} />
          )}
        </div>

        <footer className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
          Amber = the exact passage cited. Darker text = the full chunk; grey =
          surrounding context.
        </footer>
      </aside>
    </div>
  );
}

/**
 * Renders the document excerpt with three visual layers:
 *  - grey: neighboring-chunk context (`before`/`after`)
 *  - darker: the cited chunk itself
 *  - amber: the exact quoted passage within that chunk
 *
 * If the quote can't be located in the chunk (e.g. the model paraphrased), we
 * fall back to highlighting the whole chunk.
 */
function ChunkText({
  source,
  quote,
}: {
  source: SourceResolution;
  quote: string;
}) {
  const span = locateQuote(source.highlight, quote);

  return (
    <p className="whitespace-pre-wrap text-zinc-400 dark:text-zinc-500">
      {source.before}
      <span className="text-zinc-700 dark:text-zinc-300">
        {span ? (
          <>
            {source.highlight.slice(0, span.start)}
            <mark className="rounded bg-amber-200 px-0.5 text-zinc-900 dark:bg-amber-300/80">
              {source.highlight.slice(span.start, span.end)}
            </mark>
            {source.highlight.slice(span.end)}
          </>
        ) : (
          <mark className="rounded bg-amber-200/60 px-0.5 text-zinc-900 dark:bg-amber-300/60">
            {source.highlight}
          </mark>
        )}
      </span>
      {source.after}
    </p>
  );
}
