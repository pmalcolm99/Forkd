"use client";

import { Button, Input, Select, SelectItem } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_THEME, THEMES, US_STATES, type ThemeId } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { applyTheme } from "@/lib/applyTheme";

export function WelcomeForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [homeState, setHomeState] = useState<string>("");
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [error, setError] = useState<string | null>(null);

  // Stamp new users as caught-up on the changelog so they don't get a "what's new"
  // popup for the app as it already is when they first sign in.
  const markChangelogSeen = trpc.auth.markChangelogSeen.useMutation();

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      markChangelogSeen.mutate(undefined, {
        onSettled: () => router.push("/"),
      });
    },
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    updateProfile.mutate({
      firstName,
      lastName,
      homeState: (homeState || null) as (typeof US_STATES)[number]["code"] | null,
      theme,
    });
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-2 text-2xl font-bold">Welcome!</h1>
      <p className="mb-6 text-default-500">Tell us a bit about yourself.</p>
      {error && <p className="mb-4 rounded bg-danger-50 p-3 text-sm text-danger">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex gap-3">
          <Input label="First Name" value={firstName} onValueChange={setFirstName} isRequired />
          <Input label="Last Name" value={lastName} onValueChange={setLastName} isRequired />
        </div>

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
            applyTheme(val); // instant preview
          }}
        >
          {THEMES.map((t) => (
            <SelectItem key={t.id}>{t.label}</SelectItem>
          ))}
        </Select>

        <Button type="submit" color="primary" isLoading={updateProfile.isPending} className="mt-2">
          Save
        </Button>
      </form>
    </div>
  );
}
