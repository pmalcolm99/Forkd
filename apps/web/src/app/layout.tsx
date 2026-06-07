import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { serverTrpc } from "@/lib/trpc/server";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Forkd",
  description: "Family restaurant tracker",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const isDev = process.env.NODE_ENV !== "production";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let isAdmin = false;
  let userName: string | null = null;
  try {
    const caller = await serverTrpc();
    const me = await caller.auth.me();
    isAdmin = !!me.isAdmin || !!me.isOwner;
    userName = me.firstName ?? null;
  } catch {
    // Not authenticated — header shows generic menu label.
  }

  return (
    <html lang="en" className="light">
      <body>
        <Header userName={userName} isAdmin={isAdmin} isDev={isDev} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
