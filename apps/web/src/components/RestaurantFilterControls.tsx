"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Chip,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
} from "@heroui/react";
import { SlidersHorizontal, X } from "lucide-react";
import {
  COUNTRIES,
  PRICE_LEVELS,
  RESTAURANT_STATUS_LABELS,
  US_STATES,
  restaurantStatusEnum,
  type ListRestaurantsInput,
} from "@forkd/shared";

const ALL_STATUSES = restaurantStatusEnum.options;

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
  resetFilters: () => void;
  cuisines: Cuisine[];
  users: User[];
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  homeState?: string | null;
}

export function RestaurantFilterControls({
  filters,
  updateFilter,
  resetFilters,
  cuisines,
  users,
  searchValue,
  onSearchValueChange,
  homeState,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeFilterCount = [
    filters.status !== undefined,
    filters.state !== undefined,
    filters.country !== undefined,
    filters.priceLevel !== undefined,
    filters.cuisineTypeId !== undefined,
    filters.addedByUserId !== undefined,
  ].filter(Boolean).length;

  const hasActiveFilters = activeFilterCount > 0 || searchValue !== "";

  const homeStateActive = homeState != null && filters.state === homeState;

  function handleReset() {
    resetFilters();
    onSearchValueChange("");
  }

  const homeStateChip = homeState ? (
    <Chip
      size="sm"
      variant={homeStateActive ? "solid" : "flat"}
      color={homeStateActive ? "primary" : "default"}
      className="cursor-pointer"
      onClick={() => updateFilter("state", homeStateActive ? undefined : homeState)}
    >
      {homeState}
    </Chip>
  ) : null;

  const sortSelect = (
    <Select
      placeholder="Sort"
      aria-label="Sort"
      size="sm"
      className="w-40 shrink-0"
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
  );

  return (
    <>
      {/* ── Mobile layout (hidden on sm:) ─────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-2 sm:hidden">
        {/* Row 1: search */}
        <Input
          placeholder="Search name or address…"
          value={searchValue}
          onValueChange={onSearchValueChange}
          isClearable
          onClear={() => onSearchValueChange("")}
        />

        {/* Row 2: Filters button + home state chip + reset + Sort */}
        <div className="flex items-center gap-2">
          <Badge
            content={activeFilterCount}
            color="primary"
            isInvisible={activeFilterCount === 0}
            size="sm"
          >
            <Button
              variant="flat"
              size="sm"
              startContent={<SlidersHorizontal className="h-3.5 w-3.5" />}
              onPress={() => setDrawerOpen(true)}
            >
              Filters
            </Button>
          </Badge>

          {homeStateChip}

          {hasActiveFilters && (
            <Button
              isIconOnly
              variant="flat"
              size="sm"
              aria-label="Reset filters"
              onPress={handleReset}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}

          <div className="ml-auto">{sortSelect}</div>
        </div>
      </div>

      {/* ── Filter drawer (mobile only) ───────────────────────────────── */}
      <Drawer
        isOpen={drawerOpen}
        onOpenChange={setDrawerOpen}
        placement="bottom"
        classNames={{ base: "sm:hidden" }}
      >
        <DrawerContent>
          <DrawerHeader className="text-base font-semibold">Filters</DrawerHeader>

          <DrawerBody className="flex flex-col gap-4 pb-2">
            <Select
              label="Status"
              selectionMode="multiple"
              selectedKeys={new Set(filters.status ?? ALL_STATUSES)}
              onSelectionChange={(keys) => {
                const vals = Array.from(keys) as string[];
                const isAll = vals.length === ALL_STATUSES.length;
                updateFilter("status", isAll ? undefined : vals.length ? vals : undefined);
              }}
            >
              {Object.entries(RESTAURANT_STATUS_LABELS).map(([k, label]) => (
                <SelectItem key={k}>{label}</SelectItem>
              ))}
            </Select>

            <Select
              label="Country"
              selectedKeys={filters.country ? new Set([filters.country]) : new Set()}
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0] as string | undefined;
                updateFilter("country", val || undefined);
              }}
            >
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code}>{c.name}</SelectItem>
              ))}
            </Select>

            <Select
              label="Price"
              selectedKeys={filters.priceLevel ? new Set([String(filters.priceLevel)]) : new Set()}
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0] as string | undefined;
                updateFilter("priceLevel", val || undefined);
              }}
            >
              {PRICE_LEVELS.map((p) => (
                <SelectItem key={String(p.value)}>{p.label}</SelectItem>
              ))}
            </Select>

            <Select
              label="State"
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
              label="Cuisine"
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
              label="Added by"
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
          </DrawerBody>

          <DrawerFooter className="flex gap-2">
            <Button
              variant="flat"
              className="flex-1"
              onPress={() => {
                resetFilters();
                setDrawerOpen(false);
              }}
            >
              Reset
            </Button>
            <Button color="primary" className="flex-1" onPress={() => setDrawerOpen(false)}>
              Apply
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* ── Desktop layout (hidden below sm:) ────────────────────────── */}
      <div className="mb-4 hidden flex-wrap gap-3 sm:flex">
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
          selectedKeys={new Set(filters.status ?? ALL_STATUSES)}
          onSelectionChange={(keys) => {
            const vals = Array.from(keys) as string[];
            const isAll = vals.length === ALL_STATUSES.length;
            updateFilter("status", isAll ? undefined : vals.length ? vals : undefined);
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
          placeholder="Country"
          className="w-44"
          selectedKeys={filters.country ? new Set([filters.country]) : new Set()}
          onSelectionChange={(keys) => {
            const val = Array.from(keys)[0] as string | undefined;
            updateFilter("country", val || undefined);
          }}
        >
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code}>{c.name}</SelectItem>
          ))}
        </Select>

        <Select
          placeholder="Price"
          className="w-28"
          selectedKeys={filters.priceLevel ? new Set([String(filters.priceLevel)]) : new Set()}
          onSelectionChange={(keys) => {
            const val = Array.from(keys)[0] as string | undefined;
            updateFilter("priceLevel", val || undefined);
          }}
        >
          {PRICE_LEVELS.map((p) => (
            <SelectItem key={String(p.value)}>{p.label}</SelectItem>
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

        {homeStateChip}

        {hasActiveFilters && (
          <Button variant="flat" size="sm" onPress={handleReset}>
            Reset
          </Button>
        )}
      </div>
    </>
  );
}
