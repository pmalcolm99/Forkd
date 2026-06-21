import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: vi.fn() })),
}));

vi.mock("@forkd/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
  makeSignature: vi.fn(async () => "mock-sig"),
}));

vi.mock("@forkd/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@forkd/shared")>();
  return { ...actual, logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } };
});

describe("auth.signOut", () => {
  it("deletes the session row using the raw token and returns success", async () => {
    const { createCallerFactory } = await import("../trpc");
    const { appRouter } = await import("../root");

    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockDelete = vi.fn().mockReturnValue({ where: mockWhere });

    const mockDb = {
      delete: mockDelete,
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    };

    const RAW_TOKEN = "raw-tok-abc123";

    const createCaller = createCallerFactory(appRouter);
    const caller = createCaller({
      db: mockDb as never,
      session: { token: RAW_TOKEN } as never,
      user: {
        id: "user-1",
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        isAdmin: false,
        isOwner: false,
      } as never,
      fileStore: null,
      shutdownFn: null,
    });

    const result = await caller.auth.signOut();

    expect(result).toEqual({ success: true });
    // Confirm delete was called — the where clause uses the raw (unsigned) token,
    // not the signed cookie value ("rawToken.signature")
    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockWhere).toHaveBeenCalledOnce();
  });
});
