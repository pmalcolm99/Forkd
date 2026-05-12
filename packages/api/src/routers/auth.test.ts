import { describe, expect, it, vi } from "vitest";
import { bootstrapInputSchema } from "./auth";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: vi.fn() })),
}));

vi.mock("@forkd/auth", () => ({
  auth: {
    api: {
      signUpEmail: vi.fn(),
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@forkd/shared", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe("bootstrapInputSchema — email validation", () => {
  it("rejects a malformed email address", () => {
    const result = bootstrapInputSchema.safeParse({
      email: "not-an-email",
      password: "Secure1!Password",
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });
});

describe("bootstrapInputSchema — password validation", () => {
  it("rejects an 11-character password", () => {
    const result = bootstrapInputSchema.safeParse({
      email: "owner@example.com",
      password: "Short1!Pas1", // 11 chars
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an all-alphabetic 12-character password", () => {
    const result = bootstrapInputSchema.safeParse({
      email: "owner@example.com",
      password: "PasswordTwelve", // 14 alpha chars, no number or special
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid password with all complexity requirements", () => {
    const result = bootstrapInputSchema.safeParse({
      email: "owner@example.com",
      password: "Secure1!Password",
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
  });
});

describe("auth.completeBootstrap", () => {
  it("throws FORBIDDEN when users already exist", async () => {
    const { createCallerFactory } = await import("../trpc");
    const { appRouter } = await import("../root");

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([{ count: 1 }]),
      }),
      transaction: vi.fn(),
      update: vi.fn(),
    };

    const createCaller = createCallerFactory(appRouter);
    const caller = createCaller({
      db: mockDb as never,
      session: null,
      user: null,
    });

    await expect(
      caller.auth.completeBootstrap({
        email: "owner@example.com",
        password: "Secure1!Password",
        firstName: "Jane",
        lastName: "Doe",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
