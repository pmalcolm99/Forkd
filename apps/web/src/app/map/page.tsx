import { Suspense } from "react";
import { Spinner } from "@heroui/react";
import { MapClientWrapper } from "./_components/MapClientWrapper";

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <MapClientWrapper />
    </Suspense>
  );
}
