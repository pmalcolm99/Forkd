"use client";

import { useState } from "react";
import { Button } from "@heroui/react";

export function ExportSection() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setIsDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/export/restaurants");
      if (!res.ok) {
        setError(`Export failed (${res.status}). Please try again.`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
      a.download = match?.[1] ?? "forkd-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Download failed. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Export Restaurant Data</h2>
      <p className="mt-1 text-sm text-gray-500">
        Download all restaurants, cuisine types, and reviews as a JSON file. Photos are not
        included.
      </p>
      <div className="mt-4">
        <Button color="primary" isLoading={isDownloading} onPress={handleDownload}>
          Download Export
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
