"use client";

import { useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { unseenChangelog } from "@/lib/changelog";

interface Props {
  appVersion: string;
  lastSeen: string | null;
  hasOnboarded: boolean;
}

/**
 * "What's new" popup — shows changelog entries newer than the version the user
 * last saw, once per user per version. Hidden during new-user onboarding (the
 * welcome flow stamps the current version so new users start caught up).
 */
export function ChangelogPopup({ appVersion, lastSeen, hasOnboarded }: Props) {
  const entries = hasOnboarded ? unseenChangelog(lastSeen) : [];
  const [open, setOpen] = useState(entries.length > 0);

  const markSeen = trpc.auth.markChangelogSeen.useMutation();

  if (entries.length === 0) return null;

  function dismiss() {
    setOpen(false);
    // Persist so it doesn't reappear; ignore failures (it'll simply show again).
    markSeen.mutate();
  }

  return (
    <Modal isOpen={open} onClose={dismiss} scrollBehavior="inside" placement="center">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          What&apos;s new in v{appVersion}
        </ModalHeader>
        <ModalBody className="pb-2">
          {entries.map((entry) => (
            <div key={entry.version} className="flex flex-col gap-3">
              {entries.length > 1 && (
                <p className="text-xs font-medium text-default-500">v{entry.version}</p>
              )}
              {entry.highlights.map((h) => (
                <div key={h.title}>
                  <p className="font-medium">{h.title}</p>
                  <p className="text-sm text-default-500">{h.description}</p>
                </div>
              ))}
            </div>
          ))}
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onPress={dismiss}>
            Got it
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
