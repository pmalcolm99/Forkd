"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { Download, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "forkd_install_dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag when launched from the home screen.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallPrompt() {
  const [mode, setMode] = useState<"android" | "ios" | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return; // already installed
    if (localStorage.getItem(DISMISS_KEY) === "1") return; // user dismissed before

    // Android/Chrome: the browser tells us it can install.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS Safari never fires beforeinstallprompt — show manual instructions instead.
    if (isIos()) setMode("ios");

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setMode(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setMode(null);
  }

  if (!mode) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1100] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-default-200 bg-content1 p-3 shadow-lg">
        <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-lg" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Install Forkd</p>
          {mode === "ios" ? (
            <p className="flex flex-wrap items-center gap-1 text-default-500">
              Tap <Share className="inline h-3.5 w-3.5" /> then{" "}
              <span className="font-medium">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="text-default-500">Add it to your home screen for a full-screen app.</p>
          )}
        </div>
        {mode === "android" && (
          <Button
            size="sm"
            color="primary"
            startContent={<Download className="h-4 w-4" />}
            onPress={install}
          >
            Install
          </Button>
        )}
        <Button isIconOnly size="sm" variant="light" aria-label="Dismiss" onPress={dismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
