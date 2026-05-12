"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@forkd/trpc";

export const trpc = createTRPCReact<AppRouter>();
