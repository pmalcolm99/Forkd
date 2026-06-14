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
  const pathname = usePathname();

  const navLinks = [
    {
      href: "/restaurants",
      label: "Restaurants",
      isActive: pathname === "/" || pathname.startsWith("/restaurants"),
    },
    { href: "/map", label: "Map", isActive: pathname === "/map" },
  ];

  const dropdownItems: MenuItem[] = [
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

      <NavbarMenu>
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
