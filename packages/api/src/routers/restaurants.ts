import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import z from "zod";
import { restaurants } from "@forkd/db";
import { createRestaurantInput, listRestaurantsInput, updateRestaurantInput } from "@forkd/shared";
import { protectedProcedure, router } from "../trpc";

export const restaurantsRouter = router({
  list: protectedProcedure.input(listRestaurantsInput).query(async ({ input, ctx }) => {
    const filters = [isNull(restaurants.deletedAt)];
    if (input.status?.length) filters.push(inArray(restaurants.status, input.status));
    if (input.state) filters.push(eq(restaurants.state, input.state));
    if (input.cuisineTypeId) filters.push(eq(restaurants.cuisineTypeId, input.cuisineTypeId));
    if (input.addedByUserId) filters.push(eq(restaurants.addedByUserId, input.addedByUserId));
    if (input.search) {
      filters.push(
        or(
          ilike(restaurants.name, `%${input.search}%`),
          ilike(restaurants.address, `%${input.search}%`)
        )!
      );
    }

    const where = and(...filters);
    const orderBy =
      input.sort === "alphabetical" ? asc(restaurants.name) : desc(restaurants.createdAt);
    const offset = (input.page - 1) * input.pageSize;

    const [items, totalResult] = await Promise.all([
      ctx.db.query.restaurants.findMany({
        where,
        orderBy,
        limit: input.pageSize,
        offset,
        with: {
          cuisineType: true,
          addedBy: { columns: { id: true, firstName: true, lastName: true } },
        },
      }),
      ctx.db.select({ total: count() }).from(restaurants).where(where),
    ]);

    return {
      items,
      total: totalResult[0]?.total ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const row = await ctx.db.query.restaurants.findFirst({
        where: and(eq(restaurants.id, input.id), isNull(restaurants.deletedAt)),
        with: {
          cuisineType: true,
          addedBy: { columns: { id: true, firstName: true, lastName: true } },
        },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure.input(createRestaurantInput).mutation(async ({ input, ctx }) => {
    const [row] = await ctx.db
      .insert(restaurants)
      .values({ ...input, addedByUserId: ctx.user.id })
      .returning();
    return row!;
  }),

  update: protectedProcedure.input(updateRestaurantInput).mutation(async ({ input, ctx }) => {
    const { id, ...fields } = input;
    const existing = await ctx.db.query.restaurants.findFirst({
      where: and(eq(restaurants.id, id), isNull(restaurants.deletedAt)),
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

    const [updated] = await ctx.db
      .update(restaurants)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(restaurants.id, id))
      .returning();
    return updated!;
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Fetch WITHOUT deletedAt filter to distinguish "missing" from "already deleted"
      const row = await ctx.db.query.restaurants.findFirst({
        where: eq(restaurants.id, input.id),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.deletedAt !== null) throw new TRPCError({ code: "NOT_FOUND" });

      const isAdder = row.addedByUserId === ctx.user.id;
      const canDelete = isAdder || ctx.user.isAdmin || ctx.user.isOwner;
      if (!canDelete) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db
        .update(restaurants)
        .set({ deletedAt: new Date() })
        .where(eq(restaurants.id, input.id));
      return { success: true };
    }),
});
