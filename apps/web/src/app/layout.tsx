import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Forkd",
  description: "Family restaurant tracker",
};

const isDev = process.env.NODE_ENV !== "production";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <body>
        <nav className="flex justify-end gap-4 bg-gray-100 px-4 py-1 text-sm">
          {isDev && (
            <Link href="/dev/select-user" className="underline text-yellow-700">
              Switch user
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
