import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";

import { CollectionProvider } from "@/components/collection-provider";
import { ConversationsProvider } from "@/components/conversations-provider";
import { ClientOnly } from "@/components/client-only";
import { AppShell } from "@/components/app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Grounded — chat with your documents",
  description:
    "Ask questions and get answers grounded only in your documents, with citations back to the source.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <CollectionProvider>
          {/* ConversationsProvider reads `?c=` from the URL, so it (and only it)
              needs a Suspense boundary. The fallback is just the calm canvas —
              on the client this resolves immediately. */}
          <Suspense fallback={<div className="h-full bg-background" />}>
            <ConversationsProvider>
              {/* The shell is entirely client-data-driven; render it on the
                  client to avoid SSR hydration mismatches. */}
              <ClientOnly fallback={<div className="h-full bg-background" />}>
                <AppShell>{children}</AppShell>
              </ClientOnly>
            </ConversationsProvider>
          </Suspense>
        </CollectionProvider>
      </body>
    </html>
  );
}
