"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useCollections } from "@/components/collection-provider";
import { DocumentStack } from "@/components/document-stack";
import { HowItWorks } from "@/components/how-it-works";
import { Button } from "@/components/ui/button";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import type { DocumentSummary } from "@/lib/chat/protocol";
import { cn } from "@/lib/cn";

type DocsState =
  | { forId: string; status: "loaded"; items: DocumentSummary[] }
  | { forId: string; status: "error"; message: string };

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; name: string }
  | { status: "error"; message: string };

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function CorpusManager() {
  const { selected, selectedId, setSelectedId, refresh } = useCollections();
  const [docsState, setDocsState] = useState<DocsState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [upload, setUpload] = useState<UploadState>({ status: "idle" });
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetch(`/api/documents?collectionId=${selectedId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to load documents.");
        return data.documents as DocumentSummary[];
      })
      .then((items) => {
        if (!cancelled)
          setDocsState({ forId: selectedId, status: "loaded", items });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDocsState({
            forId: selectedId,
            status: "error",
            message:
              err instanceof Error ? err.message : "Failed to load documents.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, reloadKey]);

  const reloadDocs = useCallback(() => setReloadKey((k) => k + 1), []);
  const current = docsState?.forId === selectedId ? docsState : null;

  async function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !selectedId) return;
    setUpload({ status: "uploading", name: file.name });
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("collectionId", selectedId);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Upload failed.");
      if (fileRef.current) fileRef.current.value = "";
      setUpload({ status: "idle" });
      reloadDocs();
      refresh();
    } catch (err) {
      setUpload({
        status: "error",
        message: err instanceof Error ? err.message : "Upload failed.",
      });
    }
  }

  async function onDelete(doc: DocumentSummary) {
    if (!selectedId) return;
    if (!window.confirm(`Remove "${doc.filename}" and its chunks?`)) return;
    await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    reloadDocs();
    await refresh();
  }

  async function onCreateCollection(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewName("");
        refresh();
        setSelectedId(data.collection.id);
      }
    } finally {
      setCreating(false);
    }
  }

  const isReadOnly = selected?.isSample ?? false;
  const inputClass =
    "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-lg font-semibold tracking-tight">
            {selected ? selected.name : "Corpus"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {selected
              ? selected.description
                ? selected.description
                : "Manage the documents that answers in this corpus are drawn from."
              : "Select or create a corpus to manage its documents."}
          </p>
        </div>

        {/* Create corpus */}
        <section className="mb-8">
          <h2 className="mb-2 text-[13px] font-semibold text-foreground">
            New corpus
          </h2>
          <form onSubmit={onCreateCollection} className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name a new corpus…"
              className={inputClass}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={creating || newName.trim().length === 0}
              className="shrink-0"
            >
              <PlusIcon />
              Create
            </Button>
          </form>
        </section>

        {/* Upload */}
        <section className="mb-8">
          <h2 className="mb-2 text-[13px] font-semibold text-foreground">
            Documents
          </h2>
          {isReadOnly ? (
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-3.5 text-sm leading-relaxed text-muted">
              This is a preloaded{" "}
              <span className="font-medium text-foreground">sample</span> corpus
              (read-only). Create your own corpus above to upload and manage
              documents.
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong bg-surface p-4">
              <p className="mb-2.5 text-sm font-medium text-foreground">
                Add a document
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  disabled={!selectedId || upload.status === "uploading"}
                  className="text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-surface-2"
                />
                <Button
                  variant="primary"
                  onClick={onUpload}
                  disabled={!selectedId || upload.status === "uploading"}
                >
                  {upload.status === "uploading" ? "Ingesting…" : "Upload"}
                </Button>
              </div>
              <p className="mt-2.5 text-xs text-faint">
                PDF, DOCX, TXT, or Markdown.
              </p>
              {upload.status === "uploading" && (
                <p className="mt-2 text-xs text-muted">
                  Ingesting “{upload.name}” — parsing, chunking, embedding…
                </p>
              )}
              {upload.status === "error" && (
                <p className="mt-2 text-xs text-danger">{upload.message}</p>
              )}
            </div>
          )}
        </section>

        {/* Document list */}
        <section>
          {!current && <p className="text-sm text-faint">Loading…</p>}
          {current?.status === "error" && (
            <p className="text-sm text-danger">{current.message}</p>
          )}
          {current?.status === "loaded" && current.items.length === 0 && (
            <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface-2 px-4 py-9 text-center">
              <DocumentStack />
              <p className="text-sm text-muted">
                No documents yet. Upload one above to start asking questions.
              </p>
              <HowItWorks />
            </div>
          )}
          {current?.status === "loaded" && current.items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {current.items.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5 shadow-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={doc.status} />
                      <p className="truncate text-sm font-medium text-foreground">
                        {doc.filename}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-faint">
                      {doc.chunkCount} chunks · {fmtBytes(doc.byteSize)}
                      {doc.error ? ` · ${doc.error}` : ""}
                    </p>
                  </div>
                  {!isReadOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(doc)}
                      className="shrink-0 text-muted hover:text-danger"
                    >
                      <TrashIcon width={14} height={14} />
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "ready"
      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
      : status === "failed"
        ? "bg-danger/12 text-danger"
        : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        styles,
      )}
    >
      {status}
    </span>
  );
}
