"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tab, Tabs } from "@heroui/react";

interface AdminTabsProps {
  isOwner: boolean;
}

const BASE_TABS = [
  { key: "users", label: "Users", href: "/admin/users" },
  { key: "ai", label: "AI (Claude)", href: "/admin/ai" },
  { key: "transcription", label: "Transcription", href: "/admin/transcription" },
  { key: "google-places", label: "Google Places", href: "/admin/google-places" },
  { key: "map", label: "Map", href: "/admin/map" },
  { key: "bills", label: "Bills", href: "/admin/bills" },
  { key: "storage", label: "Storage", href: "/admin/storage" },
] as const;

const OWNER_TABS = [{ key: "backup", label: "Backup", href: "/admin/backup" }] as const;

const ABOUT_TAB = { key: "about", label: "About", href: "/admin/about" } as const;

export function AdminTabs({ isOwner }: AdminTabsProps) {
  const pathname = usePathname();
  const router = useRouter();

  const allTabs = isOwner ? [...BASE_TABS, ...OWNER_TABS, ABOUT_TAB] : [...BASE_TABS, ABOUT_TAB];

  const activeKey =
    allTabs.find((t) => pathname === t.href || pathname.startsWith(t.href + "/"))?.key ?? "users";

  return (
    <>
      {/* Mobile: 3-column pill grid — no horizontal scroll needed */}
      <div className="mb-6 grid grid-cols-3 gap-2 sm:hidden">
        {allTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => router.push(tab.href)}
            className={`rounded-lg px-2 py-2 text-center text-sm font-medium transition-colors ${
              activeKey === tab.key
                ? "bg-primary text-white"
                : "bg-default-100 text-default-700 hover:bg-default-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Desktop: standard horizontal tabs */}
      <div className="hidden sm:block">
        <Tabs
          selectedKey={activeKey}
          onSelectionChange={(key) => {
            const tab = allTabs.find((t) => t.key === key);
            if (tab) router.push(tab.href);
          }}
          classNames={{ panel: "hidden" }}
          className="mb-6"
        >
          {allTabs.map((tab) => (
            <Tab key={tab.key} title={tab.label} />
          ))}
        </Tabs>
      </div>
    </>
  );
}
