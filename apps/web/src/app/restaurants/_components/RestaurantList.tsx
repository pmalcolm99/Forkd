"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Map, Plus, Receipt, Upload, Utensils } from "lucide-react";
import { ImportModal } from "./ImportModal";
import {
  Button,
  Chip,
  Pagination,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import {
  RESTAURANT_STATUS_COLORS,
  RESTAURANT_STATUS_LABELS,
  formatFamilyAverage,
  formatPriceLevel,
  formatRelativeTime,
  getCountryName,
} from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { photoUrl } from "@/lib/photoUrl";
import { useRestaurantFilters } from "@/lib/useRestaurantFilters";
import { useApplyDefaultFilters } from "@/lib/useApplyDefaultFilters";
import { RestaurantFilterControls } from "@/components/RestaurantFilterControls";
import { OnboardingCard } from "@/components/OnboardingCard";

export function RestaurantList() {
  const { filters, updateFilter, resetFilters } = useRestaurantFilters();
  const [searchValue, setSearchValue] = useState(filters.search ?? "");
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      updateFilter("search", searchValue || undefined);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchValue]); // intentionally omits updateFilter — stable across renders via router

  const { data, isLoading } = trpc.restaurants.list.useQuery(filters);
  const { data: cuisines } = trpc.cuisines.list.useQuery();
  const { data: users } = trpc.users.listForFilter.useQuery();
  const { data: me } = trpc.auth.me.useQuery();

  useApplyDefaultFilters(me?.defaultFilters?.restaurants, me !== undefined);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / filters.pageSize)) : 1;

  const hasActiveFilters =
    !!searchValue ||
    filters.status !== undefined ||
    filters.state !== undefined ||
    filters.country !== undefined ||
    filters.priceLevel !== undefined ||
    filters.cuisineTypeId !== undefined ||
    filters.addedByUserId !== undefined;

  const emptyState = hasActiveFilters ? (
    <div className="py-10 text-center">
      <p className="text-default-500">No restaurants match your filters.</p>
      <Button
        className="mt-3"
        size="sm"
        variant="flat"
        onPress={() => {
          resetFilters();
          setSearchValue("");
        }}
      >
        Reset filters
      </Button>
    </div>
  ) : (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Utensils className="h-10 w-10 text-default-300" />
      <p className="text-lg font-medium">No restaurants yet</p>
      <p className="max-w-sm text-sm text-default-500">
        Add your first place or import one from a TikTok, Instagram, or YouTube post.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          as={Link}
          href="/restaurants/new"
          color="primary"
          startContent={<Plus className="h-4 w-4" />}
        >
          Add restaurant
        </Button>
        <Button
          variant="flat"
          startContent={<Upload className="h-4 w-4" />}
          onPress={() => setImportOpen(true)}
        >
          Import from social
        </Button>
      </div>
    </div>
  );

  return (
    <main className="mx-auto max-w-7xl p-6">
      <OnboardingCard />
      <div className="mb-6 flex items-center justify-between gap-2">
        {/* text-2xl below sm: at 390px the title plus four icon buttons
            overflows the row at text-3xl. */}
        <h1 className="truncate text-2xl font-bold sm:text-3xl">Restaurants</h1>
        <div className="flex shrink-0 gap-2">
          {/* Mobile: icon-only buttons */}
          <Button
            as={Link}
            href="/map"
            variant="flat"
            isIconOnly
            aria-label="Map view"
            className="sm:hidden"
          >
            <Map className="h-4 w-4" />
          </Button>
          <Button
            variant="flat"
            isIconOnly
            aria-label="Import from social"
            className="sm:hidden"
            onPress={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4" />
          </Button>
          <Button
            as={Link}
            href="/splits/new"
            variant="flat"
            isIconOnly
            aria-label="Split a bill"
            className="sm:hidden"
          >
            <Receipt className="h-4 w-4" />
          </Button>
          <Button
            as={Link}
            href="/restaurants/new"
            color="primary"
            isIconOnly
            aria-label="Add restaurant"
            className="sm:hidden"
          >
            <Plus className="h-4 w-4" />
          </Button>

          {/* Desktop: text buttons */}
          <Button as={Link} href="/map" variant="flat" className="hidden sm:flex">
            Map view
          </Button>
          <Button variant="flat" className="hidden sm:flex" onPress={() => setImportOpen(true)}>
            Import from social
          </Button>
          <Button
            as={Link}
            href="/splits/new"
            variant="flat"
            isIconOnly
            aria-label="Split a bill"
            title="Split a bill"
            className="hidden sm:flex"
          >
            <Receipt className="h-4 w-4" />
          </Button>
          <Button as={Link} href="/restaurants/new" color="primary" className="hidden sm:flex">
            Add restaurant
          </Button>
        </div>
        <ImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} />
      </div>

      <RestaurantFilterControls
        filters={filters}
        updateFilter={updateFilter}
        resetFilters={resetFilters}
        cuisines={cuisines ?? []}
        users={users ?? []}
        searchValue={searchValue}
        onSearchValueChange={setSearchValue}
        homeState={me?.homeState ?? null}
      />

      {/* Mobile card list */}
      <div className="sm:hidden">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}
        {!isLoading && (data?.items ?? []).length === 0 && emptyState}
        <div className="flex flex-col gap-3">
          {(data?.items ?? []).map((row) => {
            const statusColor = RESTAURANT_STATUS_COLORS[row.status];
            const ratingDisplay = formatFamilyAverage(row.familyAverage, row.reviewCount).display;
            return (
              <Link
                key={row.id}
                href={`/restaurants/${row.id}`}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                {row.coverPhoto ? (
                  <img
                    src={photoUrl(row.id, row.coverPhoto.id, "thumb")}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-default-100">
                    <Utensils className="h-5 w-5 text-default-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="truncate text-sm text-default-500">
                    {[row.cuisineType?.name, row.state ?? getCountryName(row.country)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Chip color={statusColor.color} className={statusColor.className} size="sm">
                      {RESTAURANT_STATUS_LABELS[row.status]}
                    </Chip>
                    {formatPriceLevel(row.googlePriceLevel) && (
                      <Chip size="sm" variant="flat" color="success">
                        {formatPriceLevel(row.googlePriceLevel)}
                      </Chip>
                    )}
                    <Chip size="sm" variant="flat" color="secondary">
                      Family: {ratingDisplay}
                    </Chip>
                    {row.googleRating && (
                      <Chip size="sm" variant="flat" color="default">
                        Google: ★ {parseFloat(row.googleRating).toFixed(1)}
                        {row.googleRatingsTotal != null
                          ? ` (${row.googleRatingsTotal.toLocaleString()})`
                          : ""}
                      </Chip>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block">
        <Table aria-label="Restaurants">
          <TableHeader>
            <TableColumn className="w-16"> </TableColumn>
            <TableColumn>Name</TableColumn>
            <TableColumn>Cuisine</TableColumn>
            <TableColumn>Location</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Rating</TableColumn>
            <TableColumn>Google Rating</TableColumn>
            <TableColumn>Added by</TableColumn>
            <TableColumn>Added</TableColumn>
          </TableHeader>
          <TableBody isLoading={isLoading} loadingContent={<Spinner />} emptyContent={emptyState}>
            {(data?.items ?? []).map((row) => {
              const statusColor = RESTAURANT_STATUS_COLORS[row.status];
              const addedBy = row.addedBy
                ? [row.addedBy.firstName, row.addedBy.lastName].filter(Boolean).join(" ")
                : "—";
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.coverPhoto ? (
                      <img
                        src={photoUrl(row.id, row.coverPhoto.id, "thumb")}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-default-100">
                        <Utensils className="h-5 w-5 text-default-400" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/restaurants/${row.id}`} className="font-medium underline">
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>{row.cuisineType?.name ?? "—"}</TableCell>
                  <TableCell>{row.state ?? getCountryName(row.country)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Chip color={statusColor.color} className={statusColor.className} size="sm">
                        {RESTAURANT_STATUS_LABELS[row.status]}
                      </Chip>
                      {formatPriceLevel(row.googlePriceLevel) && (
                        <Chip size="sm" variant="flat" color="success">
                          {formatPriceLevel(row.googlePriceLevel)}
                        </Chip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat" color="default">
                      {formatFamilyAverage(row.familyAverage, row.reviewCount).display}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    {row.googleRating ? (
                      <span className="text-sm">
                        ★ {parseFloat(row.googleRating).toFixed(1)}
                        {row.googleRatingsTotal != null
                          ? ` (${row.googleRatingsTotal.toLocaleString()})`
                          : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{addedBy}</TableCell>
                  <TableCell>{formatRelativeTime(row.createdAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination
            total={totalPages}
            page={filters.page}
            onChange={(p) => updateFilter("page", String(p))}
          />
        </div>
      )}
    </main>
  );
}
