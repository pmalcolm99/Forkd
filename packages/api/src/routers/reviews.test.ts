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

const baseReview = {
  id: "00000000-0000-0000-0000-000000000002",
  restaurantId: "00000000-0000-0000-0000-000000000001",
  userId: "user-1",
  stars: 4 as number | null,
  text: "Great place!" as string | null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeMockDb(
  overrides: {
    restaurantResult?: typeof baseRestaurant | null;
    reviewResult?: typeof baseReview | null;
    upsertResult?: typeof baseReview;
  } = {}
) {
  const restaurant =
    overrides.restaurantResult !== undefined ? overrides.restaurantResult : baseRestaurant;
  const review = overrides.reviewResult !== undefined ? overrides.reviewResult : baseReview;
  const upsertResult = overrides.upsertResult ?? baseReview;

  return {
    query: {
      restaurants: {
        findFirst: vi.fn().mockResolvedValue(restaurant),
      },
      restaurantReviews: {
        findFirst: vi.fn().mockResolvedValue(review),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([upsertResult]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  };
}

async function makeReviewsCaller(
  mockDb: ReturnType<typeof makeMockDb>,
  userCtx: { id: string; isAdmin: boolean; isOwner: boolean }
) {
  const { createCallerFactory } = await import("../trpc");
  const { appRouter } = await import("../root");
  const createCaller = createCallerFactory(appRouter);
  return createCaller({
    db: mockDb as never,
    session: { id: "sess-1", userId: userCtx.id } as never,
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

describe("reviews.upsert", () => {
  it("(a) upserts own review and returns the upserted row", async () => {
    const mockDb = makeMockDb();
    const caller = await makeReviewsCaller(mockDb, {
      id: "user-1",
      isAdmin: false,
      isOwner: false,
    });
    const result = await caller.reviews.upsert({
      restaurantId: "00000000-0000-0000-0000-000000000001",
      stars: 4,
    });
    expect(result).toMatchObject({ id: baseReview.id, stars: 4 });
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("(b) returns NOT_FOUND when restaurant does not exist or is soft-deleted", async () => {
    const mockDb = makeMockDb({ restaurantResult: null });
    const caller = await makeReviewsCaller(mockDb, {
      id: "user-1",
      isAdmin: false,
      isOwner: false,
    });
    await expect(
      caller.reviews.upsert({
        restaurantId: "00000000-0000-0000-0000-000000000001",
        stars: 3,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("reviews.delete", () => {
  it("(d) review author can delete their own review", async () => {
    const mockDb = makeMockDb();
    const caller = await makeReviewsCaller(mockDb, {
      id: "user-1",
      isAdmin: false,
      isOwner: false,
    });
    const result = await caller.reviews.delete({ id: baseReview.id });
    expect(result).toEqual({ success: true });
  });

  it("(e) non-author non-admin gets FORBIDDEN", async () => {
    const mockDb = makeMockDb();
    const caller = await makeReviewsCaller(mockDb, {
      id: "user-2",
      isAdmin: false,
      isOwner: false,
    });
    await expect(caller.reviews.delete({ id: baseReview.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("(f) admin can delete another user's review", async () => {
    const mockDb = makeMockDb();
    const caller = await makeReviewsCaller(mockDb, {
      id: "admin-1",
      isAdmin: true,
      isOwner: false,
    });
    const result = await caller.reviews.delete({ id: baseReview.id });
    expect(result).toEqual({ success: true });
  });

  it("(g) owner can delete another user's review", async () => {
    const mockDb = makeMockDb();
    const caller = await makeReviewsCaller(mockDb, {
      id: "owner-1",
      isAdmin: false,
      isOwner: true,
    });
    const result = await caller.reviews.delete({ id: baseReview.id });
    expect(result).toEqual({ success: true });
  });

  it("(h) returns NOT_FOUND when review does not exist", async () => {
    const mockDb = makeMockDb({ reviewResult: null });
    const caller = await makeReviewsCaller(mockDb, {
      id: "user-1",
      isAdmin: false,
      isOwner: false,
    });
    await expect(caller.reviews.delete({ id: baseReview.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
