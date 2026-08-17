import { Suspense } from "react";
import { Spinner } from "@heroui/react";
import { NewSplitWizard } from "./NewSplitWizard";

export const metadata = { title: "Split a bill · Forkd" };

/**
 * Server wrapper. The wizard reads `?restaurantId=` with useSearchParams(),
 * which Next requires to sit inside a Suspense boundary or the route can't be
 * prerendered.
 */
export default function NewSplitPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <NewSplitWizard />
    </Suspense>
  );
}
