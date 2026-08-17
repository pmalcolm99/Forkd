import { Suspense } from "react";
import { Spinner } from "@heroui/react";
import { SplitList } from "./_components/SplitList";

export const metadata = { title: "Bills · Forkd" };

export default function SplitsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <SplitList />
    </Suspense>
  );
}
