import { describe, expect, it, vi } from "vitest";

vi.mock("@forkd/auth", () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue(null) } },
}));

vi.mock("@forkd/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@forkd/shared")>();
  return { ...actual, logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } };
});

const addMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@forkd/queue", () => ({
  receiptQueue: { add: (...args: unknown[]) => addMock(...args) },
}));

const SPLIT_ID = "00000000-0000-0000-0000-0000000000a1";
const ITEM_ID = "00000000-0000-0000-0000-0000000000b1";
const PARTICIPANT_ID = "00000000-0000-0000-0000-0000000000c1";

const baseSplit = {
  id: SPLIT_ID,
  title: "Dinner",
  restaurantId: null,
  merchantName: null,
  purchasedAt: null,
  createdByUserId: "user-1",
  paidByParticipantId: PARTICIPANT_ID,
  currency: "USD",
  homeCurrency: "USD",
  fxMode: "none" as const,
  fxRate: null,
  statementTotalCents: null,
  subtotalCents: 2000,
  taxCents: 160,
  tipCents: 400,
  serviceCents: 0,
  discountCents: 0,
  totalCents: 2560,
  tipMode: "proportional" as const,
  taxMode: "proportional" as const,
  partySize: null,
  shareToken: "sharetoken1234567890",
  shareEnabled: true,
  status: "open" as const,
  aiStatus: "ready" as const,
  aiError: null,
  hideImagesFromOthers: false,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null as Date | null,
};

const baseParticipant = {
  id: PARTICIPANT_ID,
  splitId: SPLIT_ID,
  userId: "user-1",
  displayName: "Preston",
  isGuest: false,
  guestToken: null as string | null,
  guestTokenExpiresAt: null as Date | null,
  paidAt: null as Date | null,
  createdAt: new Date(),
};

type Overrides = {
  split?: typeof baseSplit | null;
  participant?: typeof baseParticipant | null;
  item?: { id: string; splitId: string } | null;
  configValue?: string | null;
  selectRows?: unknown[];
};

/** Chainable Drizzle stand-in: `.where()` is awaitable and also has `.returning()`. */
function makeMockDb(o: Overrides = {}) {
  const split = o.split !== undefined ? o.split : baseSplit;
  const participant = o.participant !== undefined ? o.participant : baseParticipant;
  const item = o.item !== undefined ? o.item : { id: ITEM_ID, splitId: SPLIT_ID };
  const selectRows = o.selectRows ?? [{ id: ITEM_ID, n: 1, total: 2000 }];

  const terminal = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as Promise<unknown[]> & {
      returning: () => Promise<unknown[]>;
      orderBy: () => Promise<unknown[]>;
      limit: () => Promise<unknown[]>;
    };
    p.returning = () => Promise.resolve(rows);
    p.orderBy = () => terminal(rows);
    p.limit = () => terminal(rows);
    return p;
  };

  const db = {
    query: {
      billSplits: {
        findFirst: vi.fn().mockResolvedValue(split),
        findMany: vi.fn().mockResolvedValue([]),
      },
      billSplitParticipants: {
        findFirst: vi.fn().mockResolvedValue(participant),
        findMany: vi.fn().mockResolvedValue([]),
      },
      billSplitItems: { findFirst: vi.fn().mockResolvedValue(item) },
      user: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            id: "user-1",
            firstName: "Preston",
            lastName: "M",
            name: "Preston M",
          }),
      },
      appConfig: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    select: vi.fn(() => ({ from: () => ({ where: () => terminal(selectRows) }) })),
    insert: vi.fn(() => ({ values: () => terminal([{ ...baseParticipant, id: "new-row" }]) })),
    update: vi.fn(() => ({ set: () => ({ where: () => terminal([split]) }) })),
    delete: vi.fn(() => ({ where: () => terminal([]) })),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) => cb(db)),
  };
  return db;
}

async function makeCaller(
  mockDb: ReturnType<typeof makeMockDb>,
  actor: { id: string; isAdmin: boolean; isOwner: boolean }
) {
  const { createCallerFactory } = await import("../trpc");
  const { appRouter } = await import("../root");
  return createCallerFactory(appRouter)({
    db: mockDb as never,
    session: { id: "sess-1", userId: actor.id } as never,
    fileStore: null,
    shutdownFn: null,
    user: {
      id: actor.id,
      email: "a@example.com",
      name: "Test",
      firstName: "Test",
      lastName: "User",
      emailVerified: true,
      image: null,
      isAdmin: actor.isAdmin,
      isOwner: actor.isOwner,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never,
  });
}

const CREATOR = { id: "user-1", isAdmin: false, isOwner: false };
const STRANGER = { id: "user-2", isAdmin: false, isOwner: false };
const ADMIN = { id: "user-3", isAdmin: true, isOwner: false };
const OWNER = { id: "user-4", isAdmin: false, isOwner: true };

describe("splits.update — who may edit a bill", () => {
  it("(a) the creator can edit", async () => {
    const caller = await makeCaller(makeMockDb(), CREATOR);
    await expect(caller.splits.update({ id: SPLIT_ID, title: "New" })).resolves.toBeDefined();
  });

  it("(b) an unrelated user cannot", async () => {
    const caller = await makeCaller(makeMockDb(), STRANGER);
    await expect(caller.splits.update({ id: SPLIT_ID, title: "New" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("(c) an admin can override", async () => {
    const caller = await makeCaller(makeMockDb(), ADMIN);
    await expect(caller.splits.update({ id: SPLIT_ID, title: "New" })).resolves.toBeDefined();
  });

  it("(d) the owner can override", async () => {
    const caller = await makeCaller(makeMockDb(), OWNER);
    await expect(caller.splits.update({ id: SPLIT_ID, title: "New" })).resolves.toBeDefined();
  });

  it("(e) a missing bill is NOT_FOUND, not FORBIDDEN", async () => {
    const caller = await makeCaller(makeMockDb({ split: null }), CREATOR);
    await expect(caller.splits.update({ id: SPLIT_ID, title: "New" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("(f) a soft-deleted bill is not editable", async () => {
    // The query filters on deletedAt, so a deleted row comes back as null.
    const caller = await makeCaller(makeMockDb({ split: null }), CREATOR);
    await expect(caller.splits.delete({ id: SPLIT_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("splits.setClaims — you may only pick your own items", () => {
  it("(a) a participant may set their own claims", async () => {
    const caller = await makeCaller(makeMockDb(), CREATOR);
    await expect(
      caller.splits.setClaims({
        splitId: SPLIT_ID,
        participantId: PARTICIPANT_ID,
        claims: [{ itemId: ITEM_ID, shares: 1 }],
      })
    ).resolves.toEqual({ success: true });
  });

  it("(b) a stranger cannot set someone else's claims", async () => {
    const caller = await makeCaller(makeMockDb(), STRANGER);
    await expect(
      caller.splits.setClaims({
        splitId: SPLIT_ID,
        participantId: PARTICIPANT_ID,
        claims: [{ itemId: ITEM_ID, shares: 1 }],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("(c) the bill creator may fix anyone's claims", async () => {
    const db = makeMockDb({ participant: { ...baseParticipant, userId: "someone-else" } });
    const caller = await makeCaller(db, CREATOR);
    await expect(
      caller.splits.setClaims({
        splitId: SPLIT_ID,
        participantId: PARTICIPANT_ID,
        claims: [{ itemId: ITEM_ID, shares: 1 }],
      })
    ).resolves.toEqual({ success: true });
  });

  it("(d) claims naming an item from another bill are dropped, not written", async () => {
    const db = makeMockDb({ selectRows: [] }); // no valid items on this bill
    const caller = await makeCaller(db, CREATOR);
    await caller.splits.setClaims({
      splitId: SPLIT_ID,
      participantId: PARTICIPANT_ID,
      claims: [{ itemId: "00000000-0000-0000-0000-0000000000ff", shares: 1 }],
    });
    // Old claims cleared, nothing inserted.
    expect(db.delete).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("(e) a participant from a different bill is NOT_FOUND", async () => {
    const caller = await makeCaller(makeMockDb({ participant: null }), CREATOR);
    await expect(
      caller.splits.setClaims({
        splitId: SPLIT_ID,
        participantId: PARTICIPANT_ID,
        claims: [],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("splits.setPaid", () => {
  it("lets you mark yourself paid", async () => {
    const caller = await makeCaller(makeMockDb(), CREATOR);
    await expect(
      caller.splits.setPaid({ participantId: PARTICIPANT_ID, paid: true })
    ).resolves.toEqual({ success: true });
  });

  it("stops you marking someone else paid", async () => {
    const caller = await makeCaller(makeMockDb(), STRANGER);
    await expect(
      caller.splits.setPaid({ participantId: PARTICIPANT_ID, paid: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("splits.extract", () => {
  it("refuses to queue a scan when there are no photos", async () => {
    const db = makeMockDb({ selectRows: [{ n: 0 }] });
    const caller = await makeCaller(db, CREATOR);
    await expect(caller.splits.extract({ id: SPLIT_ID })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(addMock).not.toHaveBeenCalled();
  });

  it("queues a job when photos are present", async () => {
    addMock.mockClear();
    const db = makeMockDb({ selectRows: [{ n: 1 }] });
    const caller = await makeCaller(db, CREATOR);
    await expect(caller.splits.extract({ id: SPLIT_ID })).resolves.toEqual({ queued: true });
    expect(addMock).toHaveBeenCalledWith("extract", { splitId: SPLIT_ID, userId: "user-1" });
  });

  it("rate-limits runaway scanning", async () => {
    addMock.mockClear();
    const db = makeMockDb({ selectRows: [{ n: 99 }] });
    const caller = await makeCaller(db, CREATOR);
    await expect(caller.splits.extract({ id: SPLIT_ID })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(addMock).not.toHaveBeenCalled();
  });

  it("is not available to a stranger", async () => {
    const caller = await makeCaller(makeMockDb(), STRANGER);
    await expect(caller.splits.extract({ id: SPLIT_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("splits.getByShareToken", () => {
  it("rejects a token whose sharing has been turned off", async () => {
    const db = makeMockDb({ split: { ...baseSplit, shareEnabled: false } });
    const caller = await makeCaller(db, STRANGER);
    await expect(
      caller.splits.getByShareToken({ token: "sharetoken1234567890" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an unknown token", async () => {
    const caller = await makeCaller(makeMockDb({ split: null }), STRANGER);
    await expect(
      caller.splits.getByShareToken({ token: "nope-nope-nope-nope" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("splits.mintGuestLink", () => {
  it("404s while guest links are switched off", async () => {
    const caller = await makeCaller(makeMockDb(), CREATOR);
    await expect(
      caller.splits.mintGuestLink({ participantId: PARTICIPANT_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
