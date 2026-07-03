"use client";

import { useState } from "react";

import { AppHeader } from "@/components/app-header";
import { Sidebar } from "@/components/sidebar";
import { cn } from "@/lib/cn";

/**
 * The app frame: a fixed sidebar on desktop, a slide-in drawer on mobile, and
 * the main column (header + routed content). Owns only the drawer's open state;
 * all data lives in the providers above it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const close = () => setDrawerOpen(false);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden shrink-0 md:flex">
        <Sidebar />
      </aside>

      {/* Mobile drawer (always mounted so it can animate; inert on desktop) */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          drawerOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!drawerOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/40 transition-opacity duration-200",
            drawerOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={close}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 shadow-lg transition-transform duration-200 ease-out",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar onNavigate={close} onClose={close} />
        </div>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onOpenMenu={() => setDrawerOpen(true)} />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
