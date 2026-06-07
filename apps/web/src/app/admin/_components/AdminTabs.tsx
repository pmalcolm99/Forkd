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
    <div className="-mx-6 overflow-x-auto px-6 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
      <Tabs
        selectedKey={activeKey}
        onSelectionChange={(key) => {
          const tab = allTabs.find((t) => t.key === key);
          if (tab) router.push(tab.href);
        }}
        classNames={{ panel: "hidden", tabList: "min-w-max" }}
        className="mb-6"
      >
        {allTabs.map((tab) => (
          <Tab key={tab.key} title={tab.label} />
        ))}
      </Tabs>
    </div>
  );
}
