import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@forkd/auth", () => ({
  makeSignature: vi.fn(async () => "mocksig"),
}));

vi.mock("@forkd/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@forkd/shared")>();
  return { ...actual, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});

// Helpers to build chainable Drizzle-style mock builders.
// The chain must be thenable so that `await chain.from().where()` (no .limit call)
// resolves to `rows` rather than the chain object itself.
function makeSelectChain(rows: unknown[]) {
  const p = Promise.resolve(rows);
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve(rows)),
    orderBy: vi.fn().mockImplementation(() => Promise.resolve(rows)),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  return chain;
}

function makeInsertChain() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeUpdateChain() {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) };
}

vi.mock("@forkd/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  user: {},
  session: {},
}));

beforeEach(() => {
  vi.stubEnv("MASTER_KEY", "test-master-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("provisionSessionForIdentity", () => {
  it("creates the first user as Owner+Admin when no owner exists", async () => {
    const { db } = await import("@forkd/db");
    const { provisionSessionForIdentity } = await import("./sessionProvisioning");

    // First call: user lookup by email → empty
    // Second call: owner count → 0
    // Third call: re-fetch user by id → the newly inserted user
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as never) // user lookup: not found
      .mockReturnValueOnce(makeSelectChain([{ c: 0 }]) as never) // owner count: 0
      .mockReturnValueOnce(
        makeSelectChain([{ id: "new-user-id", email: "owner@example.com", name: "Owner" }]) as never
      ); // re-fetch

    vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);

    await provisionSessionForIdentity({ email: "owner@example.com", sub: "sub1" });

    const insertCalls = vi.mocked(db.insert).mock.calls;
    // First insert is for the user row
    const firstInsertResult = vi.mocked(db.insert).mock.results[0]?.value as ReturnType<
      typeof makeInsertChain
    >;
    const userInsertValues = firstInsertResult.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(userInsertValues.isOwner).toBe(true);
    expect(userInsertValues.isAdmin).toBe(true);
    expect(insertCalls).toHaveLength(2); // user + session
  });

  it("creates a regular user (not Owner) when an owner already exists", async () => {
    const { db } = await import("@forkd/db");
    const { provisionSessionForIdentity } = await import("./sessionProvisioning");

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([]) as never)
      .mockReturnValueOnce(makeSelectChain([{ c: 1 }]) as never) // owner exists
      .mockReturnValueOnce(
        makeSelectChain([
          { id: "new-user-id", email: "new@example.com", name: "New User" },
        ]) as never
      );

    vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);

    await provisionSessionForIdentity({ email: "new@example.com", sub: "sub2" });

    const firstInsertResult2 = vi.mocked(db.insert).mock.results[0]?.value as ReturnType<
      typeof makeInsertChain
    >;
    const userInsertValues = firstInsertResult2.values.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(userInsertValues.isOwner).toBe(false);
    expect(userInsertValues.isAdmin).toBe(false);
  });

  it("reuses an existing user without re-inserting the user row", async () => {
    const { db } = await import("@forkd/db");
    const { provisionSessionForIdentity } = await import("./sessionProvisioning");

    const existingUser = {
      id: "existing-id",
      email: "existing@example.com",
      name: "Existing User",
    };

    vi.mocked(db.select).mockReturnValueOnce(makeSelectChain([existingUser]) as never); // user found

    vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);

    await provisionSessionForIdentity({ email: "existing@example.com", sub: "sub3" });

    // Only one insert call: for the session, not the user
    expect(vi.mocked(db.insert)).toHaveBeenCalledOnce();
  });

  it("updates user.name when the JWT name claim differs from stored name", async () => {
    const { db } = await import("@forkd/db");
    const { provisionSessionForIdentity } = await import("./sessionProvisioning");

    const existingUser = { id: "existing-id", email: "user@example.com", name: "Old Name" };

    vi.mocked(db.select).mockReturnValueOnce(makeSelectChain([existingUser]) as never);

    vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
    vi.mocked(db.update).mockReturnValue(makeUpdateChain() as never);

    await provisionSessionForIdentity({ email: "user@example.com", name: "New Name", sub: "sub4" });

    // db.update should have been called to sync the name
    expect(vi.mocked(db.update)).toHaveBeenCalledOnce();
    const updateResult = vi.mocked(db.update).mock.results[0]?.value as ReturnType<
      typeof makeUpdateChain
    >;
    const setCall = updateResult.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setCall.name).toBe("New Name");
    // firstName and lastName must NOT be in the update
    expect(setCall).not.toHaveProperty("firstName");
    expect(setCall).not.toHaveProperty("lastName");
  });
});
