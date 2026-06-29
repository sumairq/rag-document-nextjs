"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useCollections } from "@/components/collection-provider";
import type { DocumentSummary } from "@/lib/chat/protocol";

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

  // Load documents for the selected collection. setState only happens in the
  // async callbacks; the loading state is derived below. `reloadKey` lets event
  // handlers (upload/delete) re-trigger a fetch.
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
        if (!cancelled) setDocsState({ forId: selectedId, status: "loaded", items });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDocsState({
            forId: selectedId,
            status: "error",
            message: err instanceof Error ? err.message : "Failed to load documents.",
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

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Corpus</h1>
        <p className="text-sm text-zinc-500">
          {selected
            ? `Managing “${selected.name}”${selected.description ? ` — ${selected.description}` : ""}`
            : "Select or create a collection to manage its documents."}
        </p>
      </div>

      {/* Create collection */}
      <form onSubmit={onCreateCollection} className="mb-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New collection name…"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={creating || newName.trim().length === 0}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Create
        </button>
      </form>

      {/* Upload (hidden for read-only sample collections) */}
      {isReadOnly ? (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          This is a preloaded <span className="font-medium">sample</span> collection
          (read-only). Create your own collection above to upload and manage
          documents.
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
          <p className="mb-2 text-sm font-medium">Add a document</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              disabled={!selectedId || upload.status === "uploading"}
              className="text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
            />
            <button
              onClick={onUpload}
              disabled={!selectedId || upload.status === "uploading"}
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {upload.status === "uploading" ? "Ingesting…" : "Upload"}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-400">PDF, DOCX, TXT, or Markdown.</p>
          {upload.status === "uploading" && (
            <p className="mt-2 text-xs text-zinc-500">
              Ingesting “{upload.name}” — parsing, chunking, embedding…
            </p>
          )}
          {upload.status === "error" && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{upload.message}</p>
          )}
        </div>
      )}

      {/* Document list */}
      <div>
        <p className="mb-2 text-sm font-medium">Documents</p>
        {!current && <p className="text-sm text-zinc-400">Loading…</p>}
        {current?.status === "error" && (
          <p className="text-sm text-red-600 dark:text-red-400">{current.message}</p>
        )}
        {current?.status === "loaded" && current.items.length === 0 && (
          <p className="text-sm text-zinc-400">
            No documents yet. Upload one above to start asking questions.
          </p>
        )}
        {current?.status === "loaded" && current.items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {current.items.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={doc.status} />
                    <p className="truncate text-sm font-medium">{doc.filename}</p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">
                    {doc.chunkCount} chunks · {fmtBytes(doc.byteSize)}
                    {doc.error ? ` · ${doc.error}` : ""}
                  </p>
                </div>
                {!isReadOnly && (
                  <button
                    onClick={() => onDelete(doc)}
                    className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "ready"
      ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
      : status === "failed"
        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles}`}
    >
      {status}
    </span>
  );
}
