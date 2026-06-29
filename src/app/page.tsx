export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">RAG App</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Foundation ready. Database schema, pgvector, and the provider interface
        are in place. Ingestion, retrieval, and chat are not built yet — see{" "}
        <code className="font-mono text-sm">ARCHITECTURE.md</code>.
      </p>
    </main>
  );
}
