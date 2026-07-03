"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCollections } from "@/components/collection-provider";
import { useConversations } from "@/components/conversations-provider";
import { Button } from "@/components/ui/button";
import { MenuIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * The main-column header. Carries the mobile menu trigger, a contextual title
 * (the open thread / "New chat" / "Manage corpus"), the active corpus, and the
 * Chat ↔ Corpus nav — so both views read as one product.
 */
export function AppHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const { selected } = useCollections();
  const { conversations, activeId } = useConversations();

  const onCorpus = pathname === "/corpus";
  const activeTitle = conversations.find((c) => c.id === activeId)?.title;
  const title = onCorpus ? "Manage corpus" : (activeTitle ?? "New chat");
  const subtitle = selected
    ? onCorpus
      ? selected.name
      : `Answering from ${selected.name}`
    : null;

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-md md:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMenu}
        aria-label="Open menu"
      >
        <MenuIcon />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm leading-tight font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs leading-tight text-faint">{subtitle}</p>
        )}
      </div>

      <nav className="flex items-center gap-1">
        <NavLink href="/" active={!onCorpus}>
          Chat
        </NavLink>
        <NavLink href="/corpus" active={onCorpus}>
          Corpus
        </NavLink>
      </nav>
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
      className={cn(
        "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        active
          ? "bg-accent-subtle text-accent"
          : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
