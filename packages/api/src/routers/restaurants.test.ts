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

const baseRestaurant = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Test Restaurant",
  address: "123 Main St",
  state: "CO" as const,
  cuisineTypeId: null,
  description: null,
  website: null,
  status: "want_to_try" as const,
  latitude: null,
  longitude: null,
  googlePlaceId: null,
  googleRating: null,
  googleRatingFetchedAt: null,
  socialUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null as Date | null,
  addedByUserId: "user-1",
};

function makeMockDb(overrides: { findFirstResult?: typeof baseRestaurant | null } = {}) {
  const row = overrides.findFirstResult !== undefined ? overrides.findFirstResult : baseRestaurant;
  return {
    query: {
      restaurants: {
        findFirst: vi.fn().mockResolvedValue(row),
      },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    }),
  };
}

async function makeRestaurantsCaller(
  mockDb: ReturnType<typeof makeMockDb>,
  userCtx: { id: string; isAdmin: boolean; isOwner: boolean }
) {
  const { createCallerFactory } = await import("../trpc");
  const { appRouter } = await import("../root");
  const createCaller = createCallerFactory(appRouter);
  return createCaller({
    db: mockDb as never,
    session: { id: "sess-1", userId: userCtx.id } as never,
    fileStore: null,
    user: {
      id: userCtx.id,
      email: "test@example.com",
      name: "Test",
      firstName: "Test",
      lastName: "User",
      emailVerified: true,
      image: null,
      isAdmin: userCtx.isAdmin,
      isOwner: userCtx.isOwner,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never,
  });
}

describe("restaurants.delete", () => {
  it("adder can delete their own restaurant", async () => {
    const mockDb = makeMockDb();
    const caller = await makeRestaurantsCaller(mockDb, {
      id: "user-1",
      isAdmin: false,
      isOwner: false,
    });
    const result = await caller.restaurants.delete({
      id: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toEqual({ success: true });
  });

  it("non-adder non-admin gets FORBIDDEN", async () => {
    const mockDb = makeMockDb();
    const caller = await makeRestaurantsCaller(mockDb, {
      id: "user-2",
      isAdmin: false,
      isOwner: false,
    });
    await expect(
      caller.restaurants.delete({ id: "00000000-0000-0000-0000-000000000001" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin can delete another user's restaurant", async () => {
    const mockDb = makeMockDb();
    const caller = await makeRestaurantsCaller(mockDb, {
      id: "admin-1",
      isAdmin: true,
      isOwner: false,
    });
    const result = await caller.restaurants.delete({
      id: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toEqual({ success: true });
  });

  it("owner can delete another user's restaurant", async () => {
    const mockDb = makeMockDb();
    const caller = await makeRestaurantsCaller(mockDb, {
      id: "owner-1",
      isAdmin: false,
      isOwner: true,
    });
    const result = await caller.restaurants.delete({
      id: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toEqual({ success: true });
  });

  it("already soft-deleted row returns NOT_FOUND", async () => {
    const mockDb = makeMockDb({
      findFirstResult: { ...baseRestaurant, deletedAt: new Date("2025-01-01") },
    });
    const caller = await makeRestaurantsCaller(mockDb, {
      id: "user-1",
      isAdmin: false,
      isOwner: false,
    });
    await expect(
      caller.restaurants.delete({ id: "00000000-0000-0000-0000-000000000001" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("restaurants.get", () => {
  it("soft-deleted row returns NOT_FOUND", async () => {
    // get uses a different query (with deletedAt filter); simulate by returning null
    const mockDb = makeMockDb({ findFirstResult: null });
    const caller = await makeRestaurantsCaller(mockDb, {
      id: "user-1",
      isAdmin: false,
      isOwner: false,
    });
    await expect(
      caller.restaurants.get({ id: "00000000-0000-0000-0000-000000000001" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("restaurants.update", () => {
  it("update on soft-deleted row returns NOT_FOUND", async () => {
    // update filters by deletedAt IS NULL; simulate by returning null
    const mockDb = makeMockDb({ findFirstResult: null });
    const caller = await makeRestaurantsCaller(mockDb, {
      id: "user-1",
      isAdmin: false,
      isOwner: false,
    });
    await expect(
      caller.restaurants.update({
        id: "00000000-0000-0000-0000-000000000001",
        name: "New Name",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
