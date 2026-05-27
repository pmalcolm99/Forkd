"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "@heroui/react";
import { trpc } from "@/lib/trpc/client";

type Phase = "idle" | "confirming" | "restarting" | "polling" | "failed";

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 2_000;
const INITIAL_DELAY_MS = 3_000;
const MAX_POLL_DURATION_MS = 60_000;

export function RestartButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const consecutiveOkRef = useRef(0);
  const pollStartRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const restartMutation = trpc.config.restartServer.useMutation({
    onSuccess: () => {
      setPhase("polling");
    },
    onError: () => {
      setPhase("idle");
    },
  });

  function stopPolling() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startPolling() {
    consecutiveOkRef.current = 0;
    pollStartRef.current = Date.now();

    setTimeout(() => {
      intervalRef.current = setInterval(async () => {
        if (Date.now() - pollStartRef.current > MAX_POLL_DURATION_MS) {
          stopPolling();
          setPhase("failed");
          return;
        }

        try {
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), POLL_TIMEOUT_MS);
          const resp = await fetch("/api/v1/health", { signal: ac.signal });
          clearTimeout(timer);

          if (resp.ok) {
            consecutiveOkRef.current += 1;
            if (consecutiveOkRef.current >= 2) {
              stopPolling();
              window.location.reload();
            }
          } else {
            consecutiveOkRef.current = 0;
          }
        } catch {
          // Expected during restart — server is down, keep polling.
          consecutiveOkRef.current = 0;
        }
      }, POLL_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  }

  useEffect(() => {
    if (phase === "polling") {
      startPolling();
    }
    return () => stopPolling();
  }, [phase]); // startPolling/stopPolling are stable refs, phase is the only reactive dep

  function handleConfirm() {
    setPhase("restarting");
    restartMutation.mutate();
  }

  if (phase === "polling" || phase === "restarting") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95">
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-lg">
          <Spinner size="lg" />
          <h2 className="text-lg font-semibold">
            {phase === "restarting" ? "Sending restart signal…" : "Server is restarting"}
          </h2>
          {phase === "polling" && (
            <p className="text-sm text-gray-500">
              This usually takes 5–15 seconds. This page will reload automatically when the server
              is back.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-800">Restart appears to have failed.</p>
        <p className="mt-1 text-sm text-red-600">
          Check <code className="rounded bg-red-100 px-1">docker compose logs webapp</code> from the
          host.
        </p>
        <Button
          className="mt-3"
          size="sm"
          color="danger"
          variant="flat"
          onPress={() => {
            consecutiveOkRef.current = 0;
            setPhase("polling");
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button color="danger" variant="flat" onPress={() => setPhase("confirming")}>
        Restart server
      </Button>

      <Modal isOpen={phase === "confirming"} onClose={() => setPhase("idle")}>
        <ModalContent>
          <ModalHeader>Restart the server?</ModalHeader>
          <ModalBody>
            <p>
              In-flight requests will be allowed to finish, then the application will be unavailable
              for 5–15 seconds. Continue?
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setPhase("idle")}>
              Cancel
            </Button>
            <Button color="danger" onPress={handleConfirm}>
              Restart now
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
