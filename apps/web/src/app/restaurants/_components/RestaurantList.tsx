"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Map, Plus, Upload, Utensils } from "lucide-react";
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
  formatRelativeTime,
} from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { photoUrl } from "@/lib/photoUrl";
import { useRestaurantFilters } from "@/lib/useRestaurantFilters";
import { RestaurantFilterControls } from "@/components/RestaurantFilterControls";

export function RestaurantList() {
  const { filters, updateFilter, resetFilters } = useRestaurantFilters();
  const [searchValue, setSearchValue] = useState(filters.search ?? "");
  const [importOpen, setImportOpen] = useState(false);
  const hasSetHomeState = useRef(false);

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

  useEffect(() => {
    if (!hasSetHomeState.current && me !== undefined) {
      hasSetHomeState.current = true;
      if (me.homeState && !filters.state) {
        updateFilter("state", me.homeState);
      }
    }
  }, [me]); // intentionally omits filters/updateFilter — stable, one-shot on mount

  const totalPages = data ? Math.max(1, Math.ceil(data.total / filters.pageSize)) : 1;

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Restaurants</h1>
        <div className="flex gap-2">
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
      />

      {/* Mobile card list */}
      <div className="sm:hidden">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}
        {!isLoading && (data?.items ?? []).length === 0 && (
          <p className="py-8 text-center text-gray-400">No restaurants found.</p>
        )}
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
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-gray-100">
                    <Utensils className="h-5 w-5 text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="truncate text-sm text-gray-500">
                    {[row.cuisineType?.name, row.state].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Chip color={statusColor.color} className={statusColor.className} size="sm">
                      {RESTAURANT_STATUS_LABELS[row.status]}
                    </Chip>
                    <Chip size="sm" variant="flat" color="default">
                      {ratingDisplay}
                    </Chip>
                    {row.googleRating && (
                      <Chip size="sm" variant="flat" color="default">
                        ★ {parseFloat(row.googleRating).toFixed(1)}
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
            <TableColumn>State</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Rating</TableColumn>
            <TableColumn>Google Rating</TableColumn>
            <TableColumn>Added by</TableColumn>
            <TableColumn>Added</TableColumn>
          </TableHeader>
          <TableBody
            isLoading={isLoading}
            loadingContent={<Spinner />}
            emptyContent={<span className="text-gray-400">No restaurants found.</span>}
          >
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
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-100">
                        <Utensils className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/restaurants/${row.id}`} className="font-medium underline">
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>{row.cuisineType?.name ?? "—"}</TableCell>
                  <TableCell>{row.state}</TableCell>
                  <TableCell>
                    <Chip color={statusColor.color} className={statusColor.className} size="sm">
                      {RESTAURANT_STATUS_LABELS[row.status]}
                    </Chip>
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
