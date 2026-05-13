import { asc } from "drizzle-orm";
import { user } from "@forkd/db";
import { protectedProcedure, router } from "../trpc";

export const usersRouter = router({
  listForFilter: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: user.id, firstName: user.firstName, lastName: user.lastName })
      .from(user)
      .orderBy(asc(user.firstName), asc(user.lastName))
  ),
});
