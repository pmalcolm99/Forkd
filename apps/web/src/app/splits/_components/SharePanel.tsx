"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Alert, Button, Card, CardBody, Switch } from "@heroui/react";
import { Copy, QrCode, Share2 } from "lucide-react";

interface Props {
  shareToken: string | null;
  shareEnabled: boolean;
  summaryText: string;
  title: string;
  canEdit: boolean;
  onToggleShare: (enabled: boolean) => void;
}

/** Share controls: link, QR code for the table, and a group-chat text block. */
export function SharePanel({
  shareToken,
  shareEnabled,
  summaryText,
  title,
  canEdit,
  onToggleShare,
}: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState<null | "link" | "summary">(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const shareUrl = shareToken && origin ? `${origin}/s/${shareToken}` : null;

  useEffect(() => {
    if (!showQr || !shareUrl) return;
    void QRCode.toDataURL(shareUrl, { width: 320, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [showQr, shareUrl]);

  async function copy(text: string, which: "link" | "summary") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  async function nativeShare() {
    if (!shareUrl) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: summaryText, url: shareUrl });
        return;
      } catch {
        // User dismissed the sheet — fall through to copying.
      }
    }
    await copy(shareUrl, "link");
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Share this bill</p>
            <p className="text-sm text-default-500">
              Anyone in the family who opens the link can pick their items.
            </p>
          </div>
          {canEdit && (
            <Switch
              size="sm"
              isSelected={shareEnabled}
              onValueChange={onToggleShare}
              aria-label="Sharing enabled"
            />
          )}
        </div>

        {!shareEnabled && (
          <Alert color="warning" className="text-sm">
            Sharing is off — the link won&apos;t open for anyone else.
          </Alert>
        )}

        {shareEnabled && shareUrl && (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-content2 p-2">
              <code className="min-w-0 flex-1 truncate text-xs">{shareUrl}</code>
              <Button
                isIconOnly
                size="sm"
                variant="flat"
                aria-label="Copy link"
                onPress={() => void copy(shareUrl, "link")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                color="primary"
                startContent={<Share2 className="h-4 w-4" />}
                onPress={() => void nativeShare()}
              >
                Share link
              </Button>
              <Button
                size="sm"
                variant="flat"
                startContent={<QrCode className="h-4 w-4" />}
                onPress={() => setShowQr((v) => !v)}
              >
                {showQr ? "Hide QR" : "Show QR"}
              </Button>
              <Button size="sm" variant="flat" onPress={() => void copy(summaryText, "summary")}>
                Copy for group chat
              </Button>
            </div>

            {copied && (
              <p className="text-xs text-success">
                {copied === "link" ? "Link copied." : "Summary copied."}
              </p>
            )}

            {showQr && (
              <div className="flex flex-col items-center gap-2 rounded-lg bg-white p-4">
                {qr ? (
                  <img src={qr} alt="QR code for this bill" className="h-56 w-56" />
                ) : (
                  <p className="text-sm text-default-500">Generating…</p>
                )}
                <p className="text-xs text-default-500">Scan at the table</p>
              </div>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-default-500">Preview the summary</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-content2 p-3 text-xs">
                {summaryText}
              </pre>
            </details>
          </>
        )}
      </CardBody>
    </Card>
  );
}
