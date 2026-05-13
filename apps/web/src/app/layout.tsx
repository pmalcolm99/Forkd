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
    <html lang="en">
      <body>
        {isDev && (
          <nav className="flex justify-end bg-yellow-100 px-4 py-1 text-sm">
            <Link href="/dev/sign-in" className="underline">
              Switch user
            </Link>
          </nav>
        )}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
