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

const RESTAURANT_ID = "00000000-0000-0000-0000-000000000001";
const PHOTO_ID = "00000000-0000-0000-0000-000000000002";
const USER_ID = "user-1";

const baseRestaurant = {
  id: RESTAURANT_ID,
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
  addedByUserId: USER_ID,
};

const basePhoto = {
  id: PHOTO_ID,
  restaurantId: RESTAURANT_ID,
  uploadedByUserId: USER_ID,
  filePath: `restaurants/${RESTAURANT_ID}/${PHOTO_ID}.webp`,
  thumbPath: `restaurants/${RESTAURANT_ID}/${PHOTO_ID}_thumb.webp`,
  width: 800,
  height: 600,
  byteSize: 12345,
  createdAt: new Date(),
};

function makeMockDb(
  overrides: {
    restaurantResult?: typeof baseRestaurant | null;
    photoResult?: typeof basePhoto | null;
    photosResult?: (typeof basePhoto)[];
  } = {}
) {
  const restaurant =
    overrides.restaurantResult !== undefined ? overrides.restaurantResult : baseRestaurant;
  const photo = overrides.photoResult !== undefined ? overrides.photoResult : basePhoto;
  const photos = overrides.photosResult ?? [basePhoto];

  return {
    query: {
      restaurants: {
        findFirst: vi.fn().mockResolvedValue(restaurant),
      },
      restaurantPhotos: {
        findFirst: vi.fn().mockResolvedValue(photo),
        findMany: vi.fn().mockResolvedValue(photos),
      },
    },
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  };
}

async function makePhotosCaller(
  mockDb: ReturnType<typeof makeMockDb>,
  userCtx: { id: string; isAdmin: boolean; isOwner: boolean },
  deletePhotoFiles = vi.fn().mockResolvedValue(undefined)
) {
  const { createCallerFactory } = await import("../trpc");
  const { appRouter } = await import("../root");
  const createCaller = createCallerFactory(appRouter);
  return createCaller({
    db: mockDb as never,
    session: { id: "sess-1", userId: userCtx.id } as never,
    fileStore: { deletePhotoFiles },
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

describe("photos.list", () => {
  it("(a) returns photos for a valid restaurant", async () => {
    const mockDb = makeMockDb();
    const caller = await makePhotosCaller(mockDb, { id: USER_ID, isAdmin: false, isOwner: false });
    const result = await caller.photos.list({ restaurantId: RESTAURANT_ID });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(PHOTO_ID);
  });

  it("(b) returns NOT_FOUND for a soft-deleted restaurant", async () => {
    const mockDb = makeMockDb({
      restaurantResult: { ...baseRestaurant, deletedAt: new Date() },
    });
    // The list procedure queries with isNull(deletedAt), so findFirst returns null
    mockDb.query.restaurants.findFirst.mockResolvedValue(null);
    const caller = await makePhotosCaller(mockDb, { id: USER_ID, isAdmin: false, isOwner: false });
    await expect(caller.photos.list({ restaurantId: RESTAURANT_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("photos.delete", () => {
  it("(c) uploader can delete their own photo", async () => {
    const mockDb = makeMockDb();
    const deletePhotoFiles = vi.fn().mockResolvedValue(undefined);
    const caller = await makePhotosCaller(
      mockDb,
      { id: USER_ID, isAdmin: false, isOwner: false },
      deletePhotoFiles
    );
    const result = await caller.photos.delete({ id: PHOTO_ID });
    expect(result).toEqual({ success: true });
    expect(deletePhotoFiles).toHaveBeenCalledWith(RESTAURANT_ID, PHOTO_ID);
  });

  it("(d) non-uploader non-admin gets FORBIDDEN, files not touched", async () => {
    const mockDb = makeMockDb();
    const deletePhotoFiles = vi.fn().mockResolvedValue(undefined);
    const caller = await makePhotosCaller(
      mockDb,
      { id: "other-user", isAdmin: false, isOwner: false },
      deletePhotoFiles
    );
    await expect(caller.photos.delete({ id: PHOTO_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(deletePhotoFiles).not.toHaveBeenCalled();
  });

  it("(e) admin can delete another user's photo", async () => {
    const mockDb = makeMockDb();
    const caller = await makePhotosCaller(mockDb, { id: "admin-1", isAdmin: true, isOwner: false });
    const result = await caller.photos.delete({ id: PHOTO_ID });
    expect(result).toEqual({ success: true });
  });

  it("(f) owner can delete another user's photo", async () => {
    const mockDb = makeMockDb();
    const caller = await makePhotosCaller(mockDb, { id: "owner-1", isAdmin: false, isOwner: true });
    const result = await caller.photos.delete({ id: PHOTO_ID });
    expect(result).toEqual({ success: true });
  });

  it("(g) returns NOT_FOUND for a non-existent photo", async () => {
    const mockDb = makeMockDb({ photoResult: null });
    const caller = await makePhotosCaller(mockDb, { id: USER_ID, isAdmin: false, isOwner: false });
    await expect(caller.photos.delete({ id: PHOTO_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
