"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, SelectItem } from "@heroui/react";
import { DEFAULT_THEME, THEMES, US_STATES, type ThemeId } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { applyTheme } from "@/lib/applyTheme";

interface DefaultValues {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  homeState: string | null | undefined;
  theme: string | null | undefined;
}

interface Props {
  defaultValues: DefaultValues;
}

export function ProfileForm({ defaultValues }: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(defaultValues.firstName ?? "");
  const [lastName, setLastName] = useState(defaultValues.lastName ?? "");
  const [homeState, setHomeState] = useState<string>(defaultValues.homeState ?? "");
  const [theme, setTheme] = useState<ThemeId>(
    (defaultValues.theme as ThemeId | null) ?? DEFAULT_THEME
  );
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
    update.mutate({
      firstName,
      lastName,
      homeState: (homeState || null) as (typeof US_STATES)[number]["code"] | null,
      theme,
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

      {error && <p className="text-sm text-danger">{error}</p>}

      {update.isSuccess && <p className="text-sm text-success">Profile saved.</p>}

      <Button type="submit" color="primary" isLoading={update.isPending}>
        Save
      </Button>
    </form>
  );
}
