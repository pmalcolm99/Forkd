import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { cuisinesRouter } from "./routers/cuisines";
import { usersRouter } from "./routers/users";
import { restaurantsRouter } from "./routers/restaurants";

export const appRouter = router({
  auth: authRouter,
  cuisines: cuisinesRouter,
  users: usersRouter,
  restaurants: restaurantsRouter,
});

export type AppRouter = typeof appRouter;
