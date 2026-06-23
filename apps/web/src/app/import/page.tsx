export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { Spinner } from "@heroui/react";
import { ImportShare } from "./_components/ImportShare";

export default function ImportSharePage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Import from a shared link</h1>
      <Suspense fallback={<Spinner />}>
        <ImportShare />
      </Suspense>
    </main>
  );
}
