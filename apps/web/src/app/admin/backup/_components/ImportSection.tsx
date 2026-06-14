"use client";

import { useRef, useState } from "react";
import { Button } from "@heroui/react";

interface ImportSummary {
  restaurantsImported: number;
  restaurantsSkipped: number;
  skippedNames: string[];
  reviewsImported: number;
  reviewsSkipped: number;
  cuisineTypesCreated: number;
}

export function ImportSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResult(null);
    setError(null);
  }

  async function handleImport() {
    if (!selectedFile) return;
    setIsImporting(true);
    setResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/v1/import/restaurants", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as { message?: string } & Partial<ImportSummary>;

      if (!res.ok) {
        setError(json.message ?? "Import failed.");
        return;
      }

      setResult(json as ImportSummary);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Import Restaurant Data</h2>
      <p className="mt-1 text-sm text-gray-500">
        Importing adds new restaurants to this instance. Duplicates (matched by Google Place ID or
        name + address) are skipped. Reviews from unrecognized users are skipped.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
        />
        <Button
          color="primary"
          isDisabled={!selectedFile || isImporting}
          isLoading={isImporting}
          onPress={handleImport}
        >
          Import
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="mb-3 font-medium text-green-800">Import complete</p>
          <dl className="space-y-1 text-sm text-green-700">
            <div className="flex gap-2">
              <dt className="font-medium">Restaurants imported:</dt>
              <dd>{result.restaurantsImported}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium">Duplicates skipped:</dt>
              <dd>{result.restaurantsSkipped}</dd>
            </div>
            {result.cuisineTypesCreated > 0 && (
              <div className="flex gap-2">
                <dt className="font-medium">Cuisine types created:</dt>
                <dd>{result.cuisineTypesCreated}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="font-medium">Reviews imported:</dt>
              <dd>{result.reviewsImported}</dd>
            </div>
            {result.reviewsSkipped > 0 && (
              <div className="flex gap-2">
                <dt className="font-medium">Reviews skipped (unknown users):</dt>
                <dd>{result.reviewsSkipped}</dd>
              </div>
            )}
          </dl>
          {result.skippedNames.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-green-700">
                View skipped restaurants ({result.skippedNames.length})
              </summary>
              <ul className="mt-2 space-y-0.5 text-sm text-green-600">
                {result.skippedNames.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
