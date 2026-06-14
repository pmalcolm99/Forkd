"use client";

import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { Navigation } from "lucide-react";

interface Props {
  name: string;
  address: string;
  latitude: string | null;
  longitude: string | null;
}

export function OpenInMapsButton({ name, address, latitude, longitude }: Props) {
  const ll = latitude && longitude ? `${latitude},${longitude}` : null;
  const textQuery = encodeURIComponent(`${name}, ${address}`);

  const apps = [
    {
      key: "apple",
      label: "Apple Maps",
      url: ll
        ? `https://maps.apple.com/?ll=${ll}&q=${encodeURIComponent(name)}`
        : `https://maps.apple.com/?q=${textQuery}`,
    },
    {
      key: "google",
      label: "Google Maps",
      url: ll
        ? `https://www.google.com/maps/search/?api=1&query=${ll}`
        : `https://www.google.com/maps/search/?api=1&query=${textQuery}`,
    },
    {
      key: "waze",
      label: "Waze",
      url: ll
        ? `https://waze.com/ul?ll=${ll}&navigate=yes`
        : `https://waze.com/ul?q=${textQuery}&navigate=yes`,
    },
  ];

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button variant="flat" startContent={<Navigation className="h-4 w-4" />}>
          Navigate
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Open in map app"
        onAction={(key) => {
          const app = apps.find((a) => a.key === key);
          if (app) window.open(app.url, "_blank", "noopener,noreferrer");
        }}
      >
        <DropdownItem key="apple">Apple Maps</DropdownItem>
        <DropdownItem key="google">Google Maps</DropdownItem>
        <DropdownItem key="waze">Waze</DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
