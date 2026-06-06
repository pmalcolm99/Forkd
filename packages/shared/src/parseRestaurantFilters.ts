import { listRestaurantsInput, type ListRestaurantsInput } from "./schemas/restaurants";

export function parseRestaurantFilters(params: URLSearchParams): ListRestaurantsInput {
  const rawStatus = params.getAll("status");
  const raw = {
    status: rawStatus.length ? rawStatus : undefined,
    state: params.get("state") ?? undefined,
    cuisineTypeId: params.get("cuisineTypeId") ?? undefined,
    addedByUserId: params.get("addedByUserId") ?? undefined,
    search: params.get("search") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ? Number(params.get("page")) : undefined,
  };
  const result = listRestaurantsInput.safeParse(raw);
  return result.success ? result.data : listRestaurantsInput.parse({});
}
