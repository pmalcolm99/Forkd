import type { Metadata, Viewport } from "next";
import { DEFAULT_THEME, getThemeBackground, isValidTheme, type ThemeId } from "@forkd/shared";
import "./globals.css";
import { Providers } from "./providers";
import { serverTrpc } from "@/lib/trpc/server";
import { Header } from "@/components/Header";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/InstallPrompt";

export const metadata: Metadata = {
  title: "Forkd",
  description: "Family restaurant tracker",
  appleWebApp: {
    capable: true,
    title: "Forkd",
    statusBarStyle: "black-translucent",
  },
};

// Read the user's theme once, server-side, so the <html> class and the PWA
// chrome color are set before paint (no flash) and shared by layout + viewport.
async function getUserTheme(): Promise<ThemeId> {
  try {
    const caller = await serverTrpc();
    const me = await caller.auth.me();
    return isValidTheme(me.theme) ? me.theme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await getUserTheme();
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: getThemeBackground(theme),
  };
}

const isDev = process.env.NODE_ENV !== "production";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let isAdmin = false;
  let userName: string | null = null;
  let theme: ThemeId = DEFAULT_THEME;
  try {
    const caller = await serverTrpc();
    const me = await caller.auth.me();
    isAdmin = !!me.isAdmin || !!me.isOwner;
    userName = me.firstName ?? null;
    theme = isValidTheme(me.theme) ? me.theme : DEFAULT_THEME;
  } catch {
    // Not authenticated — header shows generic menu label, default theme.
  }

  return (
    <html lang="en" className={theme}>
      <body>
        <Header userName={userName} isAdmin={isAdmin} isDev={isDev} />
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
