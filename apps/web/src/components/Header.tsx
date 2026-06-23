"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import NextLink from "next/link";
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenuToggle,
  NavbarMenu,
  NavbarMenuItem,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
  Link,
} from "@heroui/react";
import { Plus, RotateCw } from "lucide-react";

interface Props {
  userName: string | null;
  isAdmin: boolean;
  isDev: boolean;
}

type MenuItem = {
  key: string;
  label: string;
  href: string;
  danger?: boolean;
};

export function Header({ userName, isAdmin, isDev }: Props) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pathname = usePathname();

  function handleRefresh() {
    // Spin the icon so the tap clearly registers, then reload a beat later so the
    // animation has time to paint before the navigation starts.
    setIsRefreshing(true);
    setTimeout(() => window.location.reload(), 250);
  }

  const navLinks = [
    {
      href: "/restaurants",
      label: "Restaurants",
      isActive: pathname === "/" || pathname.startsWith("/restaurants"),
    },
    { href: "/map", label: "Map", isActive: pathname === "/map" },
  ];

  const dropdownItems: MenuItem[] = [
    { key: "profile", label: "Profile", href: "/profile" },
    ...(isAdmin ? [{ key: "admin", label: "Admin", href: "/admin" }] : []),
    ...(isDev ? [{ key: "dev", label: "Switch user", href: "/dev/select-user" }] : []),
    { key: "signout", label: "Sign out", href: "/api/auth/sign-out", danger: true },
  ];

  return (
    <Navbar
      isBordered
      isMenuOpen={isMenuOpen}
      onMenuOpenChange={setIsMenuOpen}
      maxWidth="xl"
      classNames={{
        // pt-[env(safe-area-inset-top)]: the Navbar background extends behind the iOS status bar
        // (black-translucent makes it transparent, so our dark header fills that strip),
        // while this padding pushes the logo/buttons below it so they stay visible and tappable.
        base: "pt-[env(safe-area-inset-top)]",
        wrapper: "px-4",
      }}
    >
      <NavbarContent>
        <NavbarMenuToggle
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          className="sm:hidden"
        />
        <NavbarBrand>
          <Link as={NextLink} href="/restaurants" className="text-xl font-bold" color="primary">
            Forkd
          </Link>
        </NavbarBrand>
      </NavbarContent>

      <NavbarContent className="hidden gap-6 sm:flex" justify="center">
        {navLinks.map(({ href, label, isActive }) => (
          <NavbarItem key={href} isActive={isActive}>
            <Link
              as={NextLink}
              href={href}
              color={isActive ? "primary" : "foreground"}
              className="font-medium"
            >
              {label}
            </Link>
          </NavbarItem>
        ))}
      </NavbarContent>

      <NavbarContent justify="end">
        {/* Reload the page — primarily for the installed PWA, which has no browser
            refresh control. A full reload refreshes both server-rendered data and
            any client-side query caches. */}
        <NavbarItem>
          <Button
            isIconOnly
            variant="light"
            size="sm"
            aria-label="Refresh"
            isDisabled={isRefreshing}
            onPress={handleRefresh}
          >
            <RotateCw className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </NavbarItem>
        {/* Quick "add restaurant" — shown everywhere except the list page, which
            already has its own Add button. */}
        {pathname !== "/" && pathname !== "/restaurants" && (
          <NavbarItem>
            <Button
              as={NextLink}
              href="/restaurants/new"
              isIconOnly
              variant="light"
              size="sm"
              aria-label="Add restaurant"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </NavbarItem>
        )}
        <Dropdown>
          <DropdownTrigger>
            <Button variant="flat" size="sm">
              {userName ?? "Menu"}
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="User menu"
            items={dropdownItems}
            onAction={(key) => {
              const item = dropdownItems.find((i) => i.key === key);
              if (item) window.location.assign(item.href);
            }}
          >
            {(item) => (
              <DropdownItem
                key={item.key}
                color={item.danger ? "danger" : "default"}
                className={item.danger ? "text-danger" : ""}
              >
                {item.label}
              </DropdownItem>
            )}
          </DropdownMenu>
        </Dropdown>
      </NavbarContent>

      <NavbarMenu className="pt-[env(safe-area-inset-top)]">
        {navLinks.map(({ href, label, isActive }) => (
          <NavbarMenuItem key={href}>
            <Link
              as={NextLink}
              href={href}
              color={isActive ? "primary" : "foreground"}
              size="lg"
              className="w-full"
              onPress={() => setIsMenuOpen(false)}
            >
              {label}
            </Link>
          </NavbarMenuItem>
        ))}
        {isAdmin && (
          <NavbarMenuItem>
            <Link
              as={NextLink}
              href="/admin"
              color="foreground"
              size="lg"
              className="w-full"
              onPress={() => setIsMenuOpen(false)}
            >
              Admin
            </Link>
          </NavbarMenuItem>
        )}
        {isDev && (
          <NavbarMenuItem>
            <Link
              as={NextLink}
              href="/dev/select-user"
              color="foreground"
              size="lg"
              className="w-full"
              onPress={() => setIsMenuOpen(false)}
            >
              Switch user
            </Link>
          </NavbarMenuItem>
        )}
        <NavbarMenuItem>
          <a href="/api/auth/sign-out" className="w-full text-lg text-danger">
            Sign out
          </a>
        </NavbarMenuItem>
      </NavbarMenu>
    </Navbar>
  );
}
