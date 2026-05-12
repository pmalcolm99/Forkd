# @forkd/trpc

tRPC router type exports shared between the Next.js web app and any future client (mobile, CLI). Exporting the `AppRouter` type from here — rather than directly from `@forkd/api` — keeps the server implementation decoupled from the client's type import. The client uses these types to get fully-typed `trpc.restaurants.list.useQuery()` calls via TanStack Query, as described in §5 of `docs/master-requirements.md`.
