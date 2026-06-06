import type { RestaurantStatus } from "./schemas/restaurants";

type HeroUIChipColor = "default" | "primary" | "secondary" | "success" | "warning" | "danger";

export const RESTAURANT_STATUS_LABELS: Record<RestaurantStatus, string> = {
  want_to_try: "Want to try",
  been_loved: "Been — loved it",
  been_okay: "Been — it was okay",
  been_disliked: "Been — didn't like it",
  permanently_closed: "Permanently closed",
};

export const RESTAURANT_STATUS_COLORS: Record<
  RestaurantStatus,
  { color: HeroUIChipColor; className?: string }
> = {
  want_to_try: { color: "primary" },
  been_loved: { color: "success" },
  been_okay: { color: "warning" },
  been_disliked: { color: "danger" },
  permanently_closed: { color: "default", className: "bg-gray-900 text-white" },
};

export const RESTAURANT_STATUS_PIN_COLORS: Record<RestaurantStatus, string> = {
  want_to_try: "#6b7280",
  been_loved: "#22c55e",
  been_okay: "#f59e0b",
  been_disliked: "#ef4444",
  permanently_closed: "#111827",
};
