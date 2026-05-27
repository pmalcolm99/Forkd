"use client";
import Link from "next/link";
import { Button, type ButtonProps } from "@heroui/react";

type LinkButtonProps = Omit<ButtonProps, "href"> & { href: string };

export function LinkButton({ href, children, ...props }: LinkButtonProps) {
  return (
    <Button as={Link} href={href} {...props}>
      {children}
    </Button>
  );
}
