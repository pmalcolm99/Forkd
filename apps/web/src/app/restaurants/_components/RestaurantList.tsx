"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Chip,
  Input,
  Pagination,
  Select,
  SelectItem,
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
  US_STATES,
  formatRelativeTime,
  listRestaurantsInput,
} from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";

export function RestaurantList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawStatus = searchParams.getAll("status");
  const rawInput = {
    status: rawStatus.length ? rawStatus : undefined,
    state: searchParams.get("state") ?? undefined,
    cuisineTypeId: searchParams.get("cuisineTypeId") ?? undefined,
    addedByUserId: searchParams.get("addedByUserId") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
  };
  const parsed = listRestaurantsInput.safeParse(rawInput);
  const filters = parsed.success ? parsed.data : listRestaurantsInput.parse({});

  const [searchValue, setSearchValue] = useState(filters.search ?? "");

  useEffect(() => {
    const timeout = setTimeout(() => {
      updateFilter("search", searchValue || undefined);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchValue]); // intentionally omits updateFilter — stable across renders via router

  function updateFilter(key: string, value: string | string[] | undefined) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(key);
    if (value !== undefined) {
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
      else next.set(key, value);
    }
    if (key !== "page") next.set("page", "1");
    router.replace(`?${next.toString()}`);
  }

  const { data, isLoading } = trpc.restaurants.list.useQuery(filters);
  const { data: cuisines } = trpc.cuisines.list.useQuery();
  const { data: users } = trpc.users.listForFilter.useQuery();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / filters.pageSize)) : 1;

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Restaurants</h1>
        <Button as={Link} href="/restaurants/new" color="primary">
          Add restaurant
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search name or address…"
          className="w-64"
          value={searchValue}
          onValueChange={setSearchValue}
          isClearable
          onClear={() => setSearchValue("")}
        />

        <Select
          placeholder="Status"
          className="w-52"
          selectionMode="multiple"
          selectedKeys={new Set(filters.status ?? [])}
          onSelectionChange={(keys) => {
            const vals = Array.from(keys) as string[];
            updateFilter("status", vals.length ? vals : undefined);
          }}
        >
          {Object.entries(RESTAURANT_STATUS_LABELS).map(([k, label]) => (
            <SelectItem key={k}>{label}</SelectItem>
          ))}
        </Select>

        <Select
          placeholder="State"
          className="w-40"
          selectedKeys={filters.state ? new Set([filters.state]) : new Set()}
          onSelectionChange={(keys) => {
            const val = Array.from(keys)[0] as string | undefined;
            updateFilter("state", val || undefined);
          }}
        >
          {US_STATES.map((s) => (
            <SelectItem key={s.code}>{s.name}</SelectItem>
          ))}
        </Select>

        <Select
          placeholder="Cuisine"
          className="w-48"
          selectedKeys={filters.cuisineTypeId ? new Set([filters.cuisineTypeId]) : new Set()}
          onSelectionChange={(keys) => {
            const val = Array.from(keys)[0] as string | undefined;
            updateFilter("cuisineTypeId", val || undefined);
          }}
        >
          {(cuisines ?? []).map((c) => (
            <SelectItem key={c.id}>{c.name}</SelectItem>
          ))}
        </Select>

        <Select
          placeholder="Added by"
          className="w-48"
          selectedKeys={filters.addedByUserId ? new Set([filters.addedByUserId]) : new Set()}
          onSelectionChange={(keys) => {
            const val = Array.from(keys)[0] as string | undefined;
            updateFilter("addedByUserId", val || undefined);
          }}
        >
          {(users ?? []).map((u) => (
            <SelectItem key={u.id}>
              {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.id}
            </SelectItem>
          ))}
        </Select>

        <Select
          placeholder="Sort"
          className="w-44"
          selectedKeys={new Set([filters.sort])}
          onSelectionChange={(keys) => {
            const val = Array.from(keys)[0] as string | undefined;
            updateFilter("sort", val || undefined);
          }}
        >
          <SelectItem key="recent">Most recent</SelectItem>
          <SelectItem key="alphabetical">Alphabetical</SelectItem>
        </Select>
      </div>

      <Table aria-label="Restaurants">
        <TableHeader>
          <TableColumn>Name</TableColumn>
          <TableColumn>Cuisine</TableColumn>
          <TableColumn>State</TableColumn>
          <TableColumn>Status</TableColumn>
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
