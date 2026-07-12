"use client";

import { Select, SelectItem } from "@heroui/react";
import {
  COUNTRIES,
  PRICE_LEVELS,
  RESTAURANT_STATUS_LABELS,
  US_STATES,
  type FilterSet,
} from "@forkd/shared";

const SORT_OPTIONS: { key: NonNullable<FilterSet["sort"]>; label: string }[] = [
  { key: "recent", label: "Most recent" },
  { key: "alphabetical", label: "Alphabetical" },
  { key: "family_rating", label: "Highest rated" },
];

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
  value: FilterSet;
  onChange: (next: FilterSet) => void;
  cuisines: Cuisine[];
  users: User[];
}

/** Compact editor for a saved default filter set (used for both Restaurants and Map). */
export function DefaultFiltersEditor({ value, onChange, cuisines, users }: Props) {
  function set<K extends keyof FilterSet>(key: K, v: FilterSet[K]) {
    const next = { ...value };
    if (v === undefined || (Array.isArray(v) && v.length === 0)) delete next[key];
    else next[key] = v;
    onChange(next);
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Select
        label="Status"
        selectionMode="multiple"
        selectedKeys={new Set(value.status ?? [])}
        onSelectionChange={(keys) => set("status", Array.from(keys) as FilterSet["status"])}
      >
        {Object.entries(RESTAURANT_STATUS_LABELS).map(([k, label]) => (
          <SelectItem key={k}>{label}</SelectItem>
        ))}
      </Select>

      <Select
        label="Cuisine"
        selectedKeys={value.cuisineTypeId ? new Set([value.cuisineTypeId]) : new Set()}
        onSelectionChange={(keys) =>
          set("cuisineTypeId", (Array.from(keys)[0] as string | undefined) || undefined)
        }
      >
        {cuisines.map((c) => (
          <SelectItem key={c.id}>{c.name}</SelectItem>
        ))}
      </Select>

      <Select
        label="Price"
        selectedKeys={value.priceLevel ? new Set([String(value.priceLevel)]) : new Set()}
        onSelectionChange={(keys) => {
          const v = Array.from(keys)[0] as string | undefined;
          set("priceLevel", v ? (Number(v) as FilterSet["priceLevel"]) : undefined);
        }}
      >
        {PRICE_LEVELS.map((p) => (
          <SelectItem key={String(p.value)}>{p.label}</SelectItem>
        ))}
      </Select>

      <Select
        label="Country"
        selectedKeys={value.country ? new Set([value.country]) : new Set()}
        onSelectionChange={(keys) =>
          set("country", (Array.from(keys)[0] as FilterSet["country"]) || undefined)
        }
      >
        {COUNTRIES.map((c) => (
          <SelectItem key={c.code}>{c.name}</SelectItem>
        ))}
      </Select>

      <Select
        label="State"
        selectedKeys={value.state ? new Set([value.state]) : new Set()}
        onSelectionChange={(keys) =>
          set("state", (Array.from(keys)[0] as FilterSet["state"]) || undefined)
        }
      >
        {US_STATES.map((s) => (
          <SelectItem key={s.code}>{s.name}</SelectItem>
        ))}
      </Select>

      <Select
        label="Added by"
        selectedKeys={value.addedByUserId ? new Set([value.addedByUserId]) : new Set()}
        onSelectionChange={(keys) =>
          set("addedByUserId", (Array.from(keys)[0] as string | undefined) || undefined)
        }
      >
        {users.map((u) => (
          <SelectItem key={u.id}>
            {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.id}
          </SelectItem>
        ))}
      </Select>

      <Select
        label="Sort"
        selectedKeys={value.sort ? new Set([value.sort]) : new Set()}
        onSelectionChange={(keys) =>
          set("sort", (Array.from(keys)[0] as FilterSet["sort"]) || undefined)
        }
      >
        {SORT_OPTIONS.map((o) => (
          <SelectItem key={o.key}>{o.label}</SelectItem>
        ))}
      </Select>
    </div>
  );
}
