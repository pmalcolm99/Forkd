"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Divider, Input, Select, SelectItem } from "@heroui/react";
import {
  DEFAULT_THEME,
  THEMES,
  US_STATES,
  type DefaultFilters,
  type FilterSet,
  type MapDefaultView,
  type ThemeId,
} from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { applyTheme } from "@/lib/applyTheme";
import { DefaultFiltersEditor } from "./DefaultFiltersEditor";

interface Cuisine {
  id: string;
  name: string;
}
interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface DefaultValues {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  homeState: string | null | undefined;
  theme: string | null | undefined;
  mapDefaultView: string | null | undefined;
  defaultFilters: DefaultFilters | null | undefined;
  venmoHandle: string | null | undefined;
  cashAppHandle: string | null | undefined;
  paymentNote: string | null | undefined;
}

interface Props {
  defaultValues: DefaultValues;
  cuisines: Cuisine[];
  users: User[];
}

const MAP_VIEW_OPTIONS: { key: MapDefaultView; label: string }[] = [
  { key: "current_location", label: "Current location" },
  { key: "home_state", label: "Home state" },
];

export function ProfileForm({ defaultValues, cuisines, users }: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(defaultValues.firstName ?? "");
  const [lastName, setLastName] = useState(defaultValues.lastName ?? "");
  const [homeState, setHomeState] = useState<string>(defaultValues.homeState ?? "");
  const [theme, setTheme] = useState<ThemeId>(
    (defaultValues.theme as ThemeId | null) ?? DEFAULT_THEME
  );
  const [mapDefaultView, setMapDefaultView] = useState<MapDefaultView>(
    (defaultValues.mapDefaultView as MapDefaultView | null) ?? "current_location"
  );
  const [restaurantFilters, setRestaurantFilters] = useState<FilterSet>(
    defaultValues.defaultFilters?.restaurants ?? {}
  );
  const [mapFilters, setMapFilters] = useState<FilterSet>(defaultValues.defaultFilters?.map ?? {});
  const [venmoHandle, setVenmoHandle] = useState(defaultValues.venmoHandle ?? "");
  const [cashAppHandle, setCashAppHandle] = useState(defaultValues.cashAppHandle ?? "");
  const [paymentNote, setPaymentNote] = useState(defaultValues.paymentNote ?? "");
  const [error, setError] = useState<string | null>(null);

  const update = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      router.refresh();
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const defaultFilters: DefaultFilters = {};
    if (Object.keys(restaurantFilters).length) defaultFilters.restaurants = restaurantFilters;
    if (Object.keys(mapFilters).length) defaultFilters.map = mapFilters;
    update.mutate({
      firstName,
      lastName,
      homeState: (homeState || null) as (typeof US_STATES)[number]["code"] | null,
      theme,
      mapDefaultView,
      defaultFilters: Object.keys(defaultFilters).length ? defaultFilters : null,
      venmoHandle: venmoHandle.trim() || null,
      cashAppHandle: cashAppHandle.trim() || null,
      paymentNote: paymentNote.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input label="First name" value={firstName} onValueChange={setFirstName} isRequired />
      <Input label="Last name" value={lastName} onValueChange={setLastName} isRequired />
      <Select
        label="Home state"
        placeholder="No preference"
        selectedKeys={homeState ? new Set([homeState]) : new Set()}
        onSelectionChange={(keys) => {
          const val = Array.from(keys)[0] as string | undefined;
          setHomeState(val ?? "");
        }}
      >
        {US_STATES.map((s) => (
          <SelectItem key={s.code}>{s.name}</SelectItem>
        ))}
      </Select>

      <Select
        label="Theme"
        selectedKeys={new Set([theme])}
        onSelectionChange={(keys) => {
          const val = Array.from(keys)[0] as ThemeId | undefined;
          if (!val) return;
          setTheme(val);
          applyTheme(val); // instant preview; persisted on Save
        }}
      >
        {THEMES.map((t) => (
          <SelectItem key={t.id}>{t.label}</SelectItem>
        ))}
      </Select>

      <Select
        label="Default map view"
        description="How the Map page focuses when you open it."
        selectedKeys={new Set([mapDefaultView])}
        onSelectionChange={(keys) => {
          const val = Array.from(keys)[0] as MapDefaultView | undefined;
          if (val) setMapDefaultView(val);
        }}
      >
        {MAP_VIEW_OPTIONS.map((o) => (
          <SelectItem key={o.key}>{o.label}</SelectItem>
        ))}
      </Select>

      <Divider className="my-2" />

      <div id="payment" className="scroll-mt-20">
        <h2 className="text-lg font-semibold">Getting paid back</h2>
        <p className="mb-3 text-sm text-default-500">
          Shown to everyone else on a bill when you&apos;re the one who paid, so they can send your
          share back without asking. Leave blank to skip.
        </p>
        <div className="flex flex-col gap-4">
          <Input
            label="Venmo username"
            placeholder="your-handle"
            startContent={<span className="text-default-400">@</span>}
            value={venmoHandle}
            onValueChange={setVenmoHandle}
          />
          <Input
            label="Cash App cashtag"
            placeholder="yourtag"
            startContent={<span className="text-default-400">$</span>}
            value={cashAppHandle}
            onValueChange={setCashAppHandle}
          />
          <Input
            label="Anything else"
            placeholder="Zelle to 555-0100, or just get me next time"
            value={paymentNote}
            onValueChange={setPaymentNote}
          />
        </div>
      </div>

      <Divider className="my-2" />

      <div id="default-filters" className="scroll-mt-20">
        <h2 className="text-lg font-semibold">Default filters</h2>
        <p className="mb-3 text-sm text-default-500">
          Filters applied automatically when you open each page (you can still change them there).
        </p>

        <p className="mb-2 text-sm font-medium">Restaurants page</p>
        <DefaultFiltersEditor
          value={restaurantFilters}
          onChange={setRestaurantFilters}
          cuisines={cuisines}
          users={users}
        />

        <p className="mb-2 mt-4 text-sm font-medium">Map page</p>
        <DefaultFiltersEditor
          value={mapFilters}
          onChange={setMapFilters}
          cuisines={cuisines}
          users={users}
        />
      </div>

      {/* Sticky footer so Save stays reachable without scrolling to the bottom.
          -mx-6/px-6 lets it span the full width inside the max-w-xl p-6 <main>. */}
      <div className="sticky bottom-0 z-20 -mx-6 mt-2 border-t border-default-200 bg-background px-6 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        {error && <p className="mb-2 text-sm text-danger">{error}</p>}
        {update.isSuccess && <p className="mb-2 text-sm text-success">Profile saved.</p>}
        <Button type="submit" color="primary" isLoading={update.isPending} className="w-full">
          Save
        </Button>
      </div>
    </form>
  );
}
