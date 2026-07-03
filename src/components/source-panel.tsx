"use client";

import { useEffect, useState } from "react";

import type { SourceResolution } from "@/lib/chat/protocol";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";

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

type Resolved =
  | { forChunkId: string; status: "loaded"; source: SourceResolution }
  | { forChunkId: string; status: "error"; message: string };

export function SourcePanel({ chunkId, quote, onClose }: SourcePanelProps) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (chunkId) {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    const t = setTimeout(() => setVisible(false), 0);
    return () => clearTimeout(t);
  }, [chunkId]);

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
        if (!cancelled)
          setResolved({ forChunkId: chunkId, status: "loaded", source });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResolved({
            forChunkId: chunkId,
            status: "error",
            message:
              err instanceof Error ? err.message : "Failed to load source.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chunkId]);

  useEffect(() => {
    if (!chunkId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chunkId, onClose]);

  if (!chunkId) return null;

  const current = resolved?.forChunkId === chunkId ? resolved : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={`relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-lg transition-transform duration-200 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold tracking-tight">Source</h2>
            {current?.status === "loaded" && (
              <p className="mt-0.5 truncate text-xs text-muted">
                {current.source.documentFilename}
                {current.source.page != null
                  ? ` · p.${current.source.page}`
                  : ""}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close source panel"
            className="-mr-1"
          >
            <CloseIcon />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 text-[15px] leading-7">
          {!current && <p className="text-faint">Loading source…</p>}

          {current?.status === "error" && (
            <p className="text-danger">{current.message}</p>
          )}

          {current?.status === "loaded" && (
            <ChunkText source={current.source} quote={quote} />
          )}
        </div>

        <footer className="border-t border-border px-4 py-2.5 text-xs text-faint">
          The highlighted passage is the exact text cited.
        </footer>
      </aside>
    </div>
  );
}

/**
 * Renders the document excerpt with three visual layers:
 *  - faint: neighboring-chunk context (`before`/`after`)
 *  - foreground: the cited chunk itself
 *  - highlight: the exact quoted passage within that chunk
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
    <p className="whitespace-pre-wrap text-faint">
      {source.before}
      <span className="text-foreground">
        {span ? (
          <>
            {source.highlight.slice(0, span.start)}
            <mark className="rounded bg-highlight px-0.5 text-highlight-fg">
              {source.highlight.slice(span.start, span.end)}
            </mark>
            {source.highlight.slice(span.end)}
          </>
        ) : (
          <mark className="rounded bg-highlight/70 px-0.5 text-highlight-fg">
            {source.highlight}
          </mark>
        )}
      </span>
      {source.after}
    </p>
  );
}
