import { asc } from "drizzle-orm";
import { cuisineTypes } from "@forkd/db";
import { protectedProcedure, router } from "../trpc";

export const cuisinesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(cuisineTypes).orderBy(asc(cuisineTypes.name))
  ),
});
