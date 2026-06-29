"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCollections } from "@/components/collection-provider";

export function TopBar() {
  const { collections, selectedId, setSelectedId, loading } = useCollections();
  const pathname = usePathname();

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold tracking-tight">RAG</span>
        <nav className="flex gap-1 text-sm">
          <NavLink href="/" active={pathname === "/"}>
            Chat
          </NavLink>
          <NavLink href="/corpus" active={pathname === "/corpus"}>
            Corpus
          </NavLink>
        </nav>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-500">
        Corpus:
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={loading || collections.length === 0}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {collections.length === 0 && <option value="">No collections</option>}
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.documentCount})
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-md bg-accent/10 px-2.5 py-1 font-medium text-accent"
          : "rounded-md px-2.5 py-1 text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      }
    >
      {children}
    </Link>
  );
}
