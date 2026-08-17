"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Card, CardBody, Input, Select, SelectItem, Spinner } from "@heroui/react";
import { Sparkles } from "lucide-react";
import { DEFAULT_CURRENCY, TERMINAL_AI_STATUSES } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { ReceiptUpload } from "../_components/ReceiptUpload";

type Step = "details" | "photos" | "scanning";

/**
 * Create a bill: name it, attach receipt photos, kick off the scan.
 *
 * Review and editing happen on the bill page itself rather than as a wizard
 * step, so the same screen serves a fresh scan and a later correction.
 */
export function NewSplitWizard() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState<Step>("details");
  const [splitId, setSplitId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [restaurantId, setRestaurantId] = useState<string | null>(params.get("restaurantId"));
  const [error, setError] = useState<string | null>(null);

  const restaurants = trpc.splits.restaurantOptions.useQuery();

  // Prefill the title from a restaurant when arriving from its detail page.
  useEffect(() => {
    if (title || !restaurantId || !restaurants.data) return;
    const match = restaurants.data.find((r) => r.id === restaurantId);
    if (match) setTitle(match.name);
  }, [restaurantId, restaurants.data, title]);

  const splitQuery = trpc.splits.get.useQuery(
    { id: splitId ?? "" },
    { enabled: !!splitId && step === "photos" }
  );

  const statusQuery = trpc.splits.extractStatus.useQuery(
    { id: splitId ?? "" },
    {
      enabled: !!splitId && step === "scanning",
      refetchInterval: (query) => {
        const s = query.state.data?.status;
        return s && TERMINAL_AI_STATUSES.has(s) ? false : 2000;
      },
    }
  );

  // Once the worker finishes, go straight to the bill so the items can be
  // checked. Failures land there too — with the error and a manual-entry path.
  useEffect(() => {
    const s = statusQuery.data?.status;
    if (step === "scanning" && splitId && s && TERMINAL_AI_STATUSES.has(s)) {
      router.push(`/splits/${splitId}?scanned=1`);
    }
  }, [statusQuery.data?.status, step, splitId, router]);

  const createSplit = trpc.splits.create.useMutation({
    onSuccess: (res) => {
      setSplitId(res.id);
      setStep("photos");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  const extract = trpc.splits.extract.useMutation({
    onSuccess: () => setStep("scanning"),
    onError: (e) => setError(e.message),
  });

  const imageCount = splitQuery.data?.images.length ?? 0;

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-1 text-2xl font-bold">Split a bill</h1>
      <p className="mb-6 text-sm text-default-500">
        {step === "details" && "Give it a name so everyone knows which meal this is."}
        {step === "photos" &&
          "Photograph the receipt and Forkd will pull out the line items — or skip and type them in."}
        {step === "scanning" && "Reading the receipt…"}
      </p>

      {error && (
        <Alert color="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {step === "details" && (
        <Card>
          <CardBody className="flex flex-col gap-4 p-4">
            <Input
              label="What was this?"
              isRequired
              placeholder="Saturday dinner"
              value={title}
              onValueChange={setTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) {
                  createSplit.mutate({
                    title: title.trim(),
                    currency: DEFAULT_CURRENCY,
                    restaurantId,
                  });
                }
              }}
            />

            <Select
              label="Restaurant (optional)"
              size="sm"
              selectedKeys={restaurantId ? new Set([restaurantId]) : new Set<string>()}
              onSelectionChange={(keys) => {
                const id = (Array.from(keys)[0] as string) ?? null;
                setRestaurantId(id);
                const match = restaurants.data?.find((r) => r.id === id);
                if (match && !title.trim()) setTitle(match.name);
              }}
            >
              {(restaurants.data ?? []).map((r) => (
                <SelectItem key={r.id}>{r.name}</SelectItem>
              ))}
            </Select>

            <Button
              color="primary"
              isDisabled={!title.trim() || createSplit.isPending}
              isLoading={createSplit.isPending}
              onPress={() =>
                createSplit.mutate({
                  title: title.trim(),
                  currency: DEFAULT_CURRENCY,
                  restaurantId,
                })
              }
            >
              Continue
            </Button>
          </CardBody>
        </Card>
      )}

      {step === "photos" && splitId && (
        <Card>
          <CardBody className="flex flex-col gap-4 p-4">
            {splitQuery.isLoading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : (
              <ReceiptUpload
                splitId={splitId}
                images={splitQuery.data?.images ?? []}
                onUploaded={() => void splitQuery.refetch()}
              />
            )}

            <div className="flex flex-col gap-2 pt-2">
              <Button
                color="primary"
                startContent={<Sparkles className="h-4 w-4" />}
                isDisabled={imageCount === 0 || extract.isPending}
                isLoading={extract.isPending}
                onPress={() => extract.mutate({ id: splitId })}
              >
                Read the receipt
              </Button>
              <Button variant="light" onPress={() => router.push(`/splits/${splitId}`)}>
                Skip — I&apos;ll enter the items myself
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === "scanning" && (
        <Card>
          <CardBody className="flex flex-col items-center gap-4 p-10 text-center">
            <Spinner size="lg" />
            <div>
              <p className="font-medium">Reading the receipt…</p>
              <p className="mt-1 text-sm text-default-500">
                This usually takes under a minute. You can leave this page — it&apos;ll keep going
                and the bill will be waiting for you.
              </p>
            </div>
            {statusQuery.data?.status === "failed" && (
              <Alert color="danger">{statusQuery.data.error ?? "Scan failed."}</Alert>
            )}
          </CardBody>
        </Card>
      )}
    </main>
  );
}
