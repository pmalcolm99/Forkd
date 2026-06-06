import { describe, expect, it, vi } from "vitest";

vi.mock("@forkd/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@forkd/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@forkd/shared")>();
  return { ...actual, logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } };
});

vi.mock("@forkd/queue", () => ({
  importQueue: { add: vi.fn().mockResolvedValue({ id: "bq-job-1" }) },
}));

const TEST_UUID = "00000000-0000-0000-0000-000000000001";

function makeMockDbWithCount(count: number) {
  // The import router does: select({ total: count() }).from(...).where(...) -> [{ total: N }]
  // and select(...).from(...).where(...).limit(1) -> [] for status
  const mockSelect = vi.fn();
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue([{ total: count }]),
    }),
  });
  return {
    select: mockSelect,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: TEST_UUID }]),
      }),
    }),
  } as unknown as Parameters<typeof makeImportCaller>[0];
}

async function makeImportCaller(mockDb: Record<string, unknown>, userId = "user-1") {
  const { createCallerFactory } = await import("../trpc");
  const { appRouter } = await import("../root");
  const createCaller = createCallerFactory(appRouter);
  return createCaller({
    db: mockDb as never,
    session: { id: "sess-1", userId } as never,
    fileStore: null,
    shutdownFn: null,
    user: {
      id: userId,
      email: "test@example.com",
      name: "Test",
      firstName: "Test",
      lastName: "User",
      emailVerified: true,
      image: null,
      isAdmin: false,
      isOwner: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never,
  });
}

// ── URL allowlist ────────────────────────────────────────────────────────────

describe("import.start — URL allowlist", () => {
  const validUrls = [
    "https://www.tiktok.com/@user/video/1234567890",
    "https://tiktok.com/@user/video/1234567890",
    "https://www.youtube.com/watch?v=abc123",
    "https://youtube.com/watch?v=abc123",
    "https://youtu.be/abc123",
    "https://www.facebook.com/video/1234567890",
    "https://facebook.com/video/1234567890",
    "https://fb.watch/abc123",
  ];

  for (const url of validUrls) {
    it(`accepts ${new URL(url).hostname}`, async () => {
      const mockDb = makeMockDbWithCount(0);
      const caller = await makeImportCaller(mockDb);
      const result = await caller.import.start({ url });
      expect(result).toEqual({ jobId: TEST_UUID });
    });
  }

  const rejectedUrls = [
    "https://evil-tiktok.com/video/123",
    "https://randomhost.com/video/123",
    "https://tiktok.com.evil.com/video/123",
    "https://notyoutube.com/watch?v=abc",
  ];

  for (const url of rejectedUrls) {
    it(`rejects ${new URL(url).hostname}`, async () => {
      const mockDb = makeMockDbWithCount(0);
      const caller = await makeImportCaller(mockDb);
      await expect(caller.import.start({ url })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
  }
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe("import.start — rate limiting", () => {
  const validUrl = "https://www.tiktok.com/@user/video/1234567890";

  it("allows import when 4 jobs exist in the last hour", async () => {
    const mockDb = makeMockDbWithCount(4);
    const caller = await makeImportCaller(mockDb);
    const result = await caller.import.start({ url: validUrl });
    expect(result).toEqual({ jobId: TEST_UUID });
  });

  it("rejects import when 5 jobs already exist in the last hour", async () => {
    const mockDb = makeMockDbWithCount(5);
    const caller = await makeImportCaller(mockDb);
    await expect(caller.import.start({ url: validUrl })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});
