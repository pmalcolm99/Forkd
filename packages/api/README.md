# @forkd/api

tRPC routers and business logic for Forkd. All client-server contracts live here.

## Procedure tiers

Every procedure is wrapped in one of four levels enforced by middleware in `src/trpc.ts`:

| Export               | Who can call it                                  |
| -------------------- | ------------------------------------------------ |
| `publicProcedure`    | Anyone, no session required                      |
| `protectedProcedure` | Any authenticated user                           |
| `adminProcedure`     | Users where `isAdmin = true` or `isOwner = true` |
| `ownerProcedure`     | The single user where `isOwner = true`           |

RBAC is enforced here in the API layer. Hiding a button in the UI is not authorization.

## Router layout

One file per domain area under `src/routers/`:

- **`auth.ts`** — `me`, `updateProfile`, `completeBootstrap`

Additional routers will be added in later phases: `restaurants`, `reviews`, `photos`, `cuisines`, `import`, `users`, `config`, `backups`.

## Adding a new router

1. Create `src/routers/<domain>.ts`
2. Export a router built with `router({ ... })` from `../trpc`
3. Add it to `src/root.ts` under `appRouter`
4. The TypeScript types flow automatically to the client via `@forkd/trpc`

## Test fixtures

**`src/external/test-fixtures/silence.mp3`** — A 1-second silent MPEG1 Layer3 mono 32 kbps MP3.
Used by `config.testWhisper` to verify the OpenAI Whisper API key.

The file is committed as a binary blob. To regenerate it (requires ffmpeg):

```
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -q:a 9 -acodec libmp3lame \
  src/external/test-fixtures/silence.mp3
```

After regenerating, update the `SILENCE_MP3_BASE64` constant in `src/routers/config.ts`:

```
base64 -i src/external/test-fixtures/silence.mp3
```

## Testing

```
pnpm test
```

Tests run with Vitest in Node environment. The `next/headers`, `@forkd/auth`, and `@forkd/shared` modules are mocked — no real DB or Next.js runtime required.
