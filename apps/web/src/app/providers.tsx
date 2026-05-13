"use client";

import { HeroUIProvider } from "@heroui/react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError(err) {
            if (err instanceof TRPCClientError && err.data?.code === "UNAUTHORIZED") {
              router.push("/sign-in");
            }
          },
        }),
        mutationCache: new MutationCache({
          onError(err) {
            if (err instanceof TRPCClientError && err.data?.code === "UNAUTHORIZED") {
              router.push("/sign-in");
            }
          },
        }),
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <HeroUIProvider>{children}</HeroUIProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
