"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  const { filters, updateFilter } = useRestaurantFilters();
  const [searchValue, setSearchValue] = useState(filters.search ?? "");

  useEffect(() => {
    const timeout = setTimeout(() => {
      updateFilter("search", searchValue || undefined);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchValue]); // intentionally omits updateFilter — stable across renders via router

  const { data, isLoading } = trpc.restaurants.list.useQuery(filters);
  const { data: cuisines } = trpc.cuisines.list.useQuery();
  const { data: users } = trpc.users.listForFilter.useQuery();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / filters.pageSize)) : 1;

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Restaurants</h1>
        <div className="flex gap-2">
          <Button as={Link} href="/map" variant="flat">
            Map view
          </Button>
          <Button as={Link} href="/restaurants/new" color="primary">
            Add restaurant
          </Button>
        </div>
      </div>

      <RestaurantFilterControls
        filters={filters}
        updateFilter={updateFilter}
        cuisines={cuisines ?? []}
        users={users ?? []}
        searchValue={searchValue}
        onSearchValueChange={setSearchValue}
      />

      <Table aria-label="Restaurants">
        <TableHeader>
          <TableColumn className="w-16"> </TableColumn>
          <TableColumn>Name</TableColumn>
          <TableColumn>Cuisine</TableColumn>
          <TableColumn>State</TableColumn>
          <TableColumn>Status</TableColumn>
          <TableColumn>Rating</TableColumn>
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
                    <div className="h-12 w-12 rounded bg-gray-100" />
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
                <TableCell>{addedBy}</TableCell>
                <TableCell>{formatRelativeTime(row.createdAt)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

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
