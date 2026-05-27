import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { serverTrpc } from "@/lib/trpc/server";

export const metadata: Metadata = {
  title: "Forkd",
  description: "Family restaurant tracker",
};

const isDev = process.env.NODE_ENV !== "production";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let isAdmin = false;
  try {
    const caller = await serverTrpc();
    const me = await caller.auth.me();
    isAdmin = !!me.isAdmin || !!me.isOwner;
  } catch {
    // Not authenticated — no Admin link shown.
  }

  return (
    <html lang="en" className="light">
      <body>
        <nav className="flex justify-end gap-4 bg-gray-100 px-4 py-1 text-sm">
          {isDev && (
            <Link href="/dev/select-user" className="underline text-yellow-700">
              Switch user
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin" className="underline">
              Admin
            </Link>
          )}
          <Link href="/sign-out" className="underline">
            Sign out
          </Link>
        </nav>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
