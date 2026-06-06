"use client";

import { Input, Select, SelectItem } from "@heroui/react";
import { RESTAURANT_STATUS_LABELS, US_STATES, type ListRestaurantsInput } from "@forkd/shared";

interface Cuisine {
  id: string;
  name: string;
}

interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface Props {
  filters: ListRestaurantsInput;
  updateFilter: (key: string, value: string | string[] | undefined) => void;
  cuisines: Cuisine[];
  users: User[];
  searchValue: string;
  onSearchValueChange: (value: string) => void;
}

export function RestaurantFilterControls({
  filters,
  updateFilter,
  cuisines,
  users,
  searchValue,
  onSearchValueChange,
}: Props) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <Input
        placeholder="Search name or address…"
        className="w-64"
        value={searchValue}
        onValueChange={onSearchValueChange}
        isClearable
        onClear={() => onSearchValueChange("")}
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
        {cuisines.map((c) => (
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
        {users.map((u) => (
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
        <SelectItem key="family_rating">Highest rated</SelectItem>
      </Select>
    </div>
  );
}
