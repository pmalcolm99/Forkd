import { Suspense } from "react";
import { Spinner } from "@heroui/react";
import { RestaurantList } from "./_components/RestaurantList";

export default function RestaurantsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <RestaurantList />
    </Suspense>
  );
}
