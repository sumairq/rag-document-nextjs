"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * True on the client after hydration, false during SSR / the first client
 * render. Uses `useSyncExternalStore` (not an effect) so it's SSR-safe and
 * doesn't trip the set-state-in-effect rule.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * Renders `children` only on the client. The app shell is entirely driven by
 * client data (collections in localStorage, the selected thread in the URL),
 * so rendering it during SSR would mismatch on hydration. Both the server and
 * the first client render emit `fallback`, which then swaps to the real UI.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return useIsClient() ? <>{children}</> : <>{fallback}</>;
}
