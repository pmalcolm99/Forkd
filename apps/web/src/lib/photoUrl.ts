export function photoUrl(restaurantId: string, photoId: string, kind: "full" | "thumb"): string {
  const suffix = kind === "thumb" ? "_thumb" : "";
  return `/api/v1/photos/restaurants/${restaurantId}/${photoId}${suffix}.webp`;
}
