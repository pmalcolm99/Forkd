"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "@heroui/react";
import { Download, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function BackupsSection() {
  const utils = trpc.useUtils();
  const list = trpc.backups.list.useQuery();
  const schedule = trpc.backups.getSchedule.useQuery();

  const [activeJob, setActiveJob] = useState<{ id: string; kind: "backup" | "restore" } | null>(
    null
  );
  const [banner, setBanner] = useState<{ type: "success" | "danger"; text: string } | null>(null);

  // Poll the active job until it finishes (TanStack Query v5 has no onSuccess on
  // useQuery, so react to the data in an effect instead).
  const jobStatus = trpc.backups.jobStatus.useQuery(
    { jobId: activeJob?.id ?? "" },
    { enabled: !!activeJob, refetchInterval: 2000 }
  );

  useEffect(() => {
    if (!activeJob || !jobStatus.data) return;
    if (jobStatus.data.state === "completed") {
      setBanner({
        type: "success",
        text: activeJob.kind === "backup" ? "Backup complete." : "Restore complete.",
      });
      setActiveJob(null);
      void utils.backups.list.invalidate();
    } else if (jobStatus.data.state === "failed") {
      setBanner({ type: "danger", text: jobStatus.data.failedReason ?? "Job failed." });
      setActiveJob(null);
    }
  }, [jobStatus.data, activeJob, utils]);

  const createBackup = trpc.backups.create.useMutation({
    onSuccess: (res) => {
      setBanner(null);
      setActiveJob({ id: res.jobId, kind: "backup" });
    },
    onError: (e) => setBanner({ type: "danger", text: e.message }),
  });

  const removeBackup = trpc.backups.remove.useMutation({
    onSuccess: () => utils.backups.list.invalidate(),
    onError: (e) => setBanner({ type: "danger", text: e.message }),
  });

  const restoreBackup = trpc.backups.restore.useMutation({
    onSuccess: (res) => {
      setConfirm(null);
      setBanner(null);
      setActiveJob({ id: res.jobId, kind: "restore" });
    },
    onError: (e) => setBanner({ type: "danger", text: e.message }),
  });

  const [confirm, setConfirm] = useState<{ filename: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const busy = !!activeJob;

  return (
    <div className="space-y-6">
      {banner && <Alert color={banner.type}>{banner.text}</Alert>}

      {/* Create + list */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Full backups</h2>
            <p className="text-sm text-default-500">
              A backup includes the database, all photos, and configuration. Keep your MASTER_KEY
              safe — it&apos;s required to restore encrypted settings.
            </p>
          </div>
          <Button
            color="primary"
            className="shrink-0 whitespace-nowrap"
            isLoading={createBackup.isPending || (busy && activeJob?.kind === "backup")}
            isDisabled={busy}
            onPress={() => createBackup.mutate()}
          >
            Back up now
          </Button>
        </CardHeader>
        <CardBody>
          {list.isLoading ? (
            <Spinner />
          ) : (list.data ?? []).length === 0 ? (
            <p className="text-sm text-default-500">No backups yet.</p>
          ) : (
            <div className="space-y-2">
              {list.data!.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-content2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.filename}</p>
                    <p className="text-xs text-default-500">
                      {formatBytes(b.byteSize)} · {b.trigger} · {b.triggeredBy} ·{" "}
                      {new Date(b.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      as="a"
                      href={`/api/v1/backups/${encodeURIComponent(b.filename)}`}
                      isIconOnly
                      size="sm"
                      variant="light"
                      aria-label="Download backup"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="danger"
                      aria-label="Delete backup"
                      isDisabled={removeBackup.isPending}
                      onPress={() => removeBackup.mutate({ id: b.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="flat"
                      color="warning"
                      isDisabled={busy}
                      onPress={() => {
                        setConfirmText("");
                        setConfirm({ filename: b.filename });
                      }}
                    >
                      Restore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {busy && (
            <p className="mt-3 flex items-center gap-2 text-sm text-default-500">
              <Spinner size="sm" />
              {activeJob?.kind === "backup" ? "Creating backup…" : "Restoring…"}
            </p>
          )}
        </CardBody>
      </Card>

      {/* Schedule — mount only once data is loaded so initial values are correct. */}
      {schedule.data && (
        <ScheduleForm
          initialCron={schedule.data.cron}
          initialRetention={schedule.data.retentionCount}
          onSaved={() => {
            setBanner({ type: "success", text: "Schedule saved." });
            void schedule.refetch();
          }}
          onError={(text) => setBanner({ type: "danger", text })}
        />
      )}

      {/* Restore-by-upload */}
      <RestoreUpload
        disabled={busy}
        onStarted={(jobId) => {
          setBanner(null);
          setActiveJob({ id: jobId, kind: "restore" });
        }}
        onError={(text) => setBanner({ type: "danger", text })}
      />

      {/* Restore-from-list confirmation */}
      <Modal isOpen={confirm !== null} onClose={() => setConfirm(null)}>
        <ModalContent>
          <ModalHeader>Restore from backup?</ModalHeader>
          <ModalBody>
            <Alert color="warning">
              This replaces ALL current data with the contents of{" "}
              <span className="font-medium">{confirm?.filename}</span>. This cannot be undone. The
              app enters maintenance mode during the restore.
            </Alert>
            <p className="text-sm">
              Type <span className="font-mono font-semibold">RESTORE</span> to confirm:
            </p>
            <Input
              value={confirmText}
              onValueChange={setConfirmText}
              aria-label="Confirm restore"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              color="danger"
              isDisabled={confirmText !== "RESTORE" || restoreBackup.isPending}
              isLoading={restoreBackup.isPending}
              onPress={() => confirm && restoreBackup.mutate({ filename: confirm.filename })}
            >
              Restore
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function ScheduleForm({
  initialCron,
  initialRetention,
  onSaved,
  onError,
}: {
  initialCron: string;
  initialRetention: number;
  onSaved: () => void;
  onError: (text: string) => void;
}) {
  const [cron, setCron] = useState(initialCron);
  const [retention, setRetention] = useState(String(initialRetention));
  const synced = useRef(false);

  // Sync once when the query resolves.
  useEffect(() => {
    if (!synced.current) {
      synced.current = true;
      setCron(initialCron);
      setRetention(String(initialRetention));
    }
  }, [initialCron, initialRetention]);

  const save = trpc.backups.setSchedule.useMutation({
    onSuccess: onSaved,
    onError: (e) => onError(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex-col items-start">
        <h2 className="text-lg font-semibold">Scheduled backups</h2>
        <p className="text-sm text-default-500">
          A 5-field cron expression (e.g. <span className="font-mono">0 3 * * *</span> = daily at 3
          AM). Leave blank to disable. Older backups beyond the retention count are pruned
          automatically.
        </p>
      </CardHeader>
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          label="Cron schedule"
          placeholder="0 3 * * *"
          value={cron}
          onValueChange={setCron}
          className="sm:max-w-xs"
        />
        <Input
          label="Keep last N backups"
          type="number"
          value={retention}
          onValueChange={setRetention}
          className="sm:max-w-[12rem]"
        />
        <Button
          color="primary"
          isLoading={save.isPending}
          onPress={() =>
            save.mutate({ cron: cron.trim(), retentionCount: Number(retention) || 30 })
          }
        >
          Save schedule
        </Button>
      </CardBody>
    </Card>
  );
}

function RestoreUpload({
  disabled,
  onStarted,
  onError,
}: {
  disabled: boolean;
  onStarted: (jobId: string) => void;
  onError: (text: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleRestore() {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/v1/backups/restore", { method: "POST", body: fd });
      const json = (await res.json()) as { jobId?: string; message?: string };
      if (!res.ok) {
        onError(json.message ?? "Restore upload failed.");
        return;
      }
      if (json.jobId) onStarted(json.jobId);
      setFile(null);
      setConfirmText("");
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      onError("Restore upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-col items-start">
        <h2 className="text-lg font-semibold">Restore from a file</h2>
        <p className="text-sm text-default-500">
          Upload a <span className="font-mono">.tar.gz</span> backup to replace all current data.
          The MASTER_KEY must match the one used when the backup was created.
        </p>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".gz,.tar.gz,application/gzip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-default-600 file:mr-3 file:rounded file:border-0 file:bg-default-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-default-700 hover:file:bg-default-200"
        />
        {file && (
          <div className="flex flex-col gap-2">
            <Alert color="warning">
              This permanently replaces all current data. Type{" "}
              <span className="font-mono font-semibold">RESTORE</span> to confirm.
            </Alert>
            <Input
              value={confirmText}
              onValueChange={setConfirmText}
              aria-label="Confirm restore upload"
              className="sm:max-w-xs"
            />
            <div>
              <Button
                color="danger"
                isDisabled={disabled || confirmText !== "RESTORE" || uploading}
                isLoading={uploading}
                onPress={handleRestore}
              >
                Upload &amp; restore
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
