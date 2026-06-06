import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { configRouter } from "./routers/config";
import { cuisinesRouter } from "./routers/cuisines";
import { importRouter } from "./routers/import";
import { usersRouter } from "./routers/users";
import { restaurantsRouter } from "./routers/restaurants";
import { reviewsRouter } from "./routers/reviews";
import { photosRouter } from "./routers/photos";

export const appRouter = router({
  auth: authRouter,
  config: configRouter,
  cuisines: cuisinesRouter,
  import: importRouter,
  users: usersRouter,
  restaurants: restaurantsRouter,
  reviews: reviewsRouter,
  photos: photosRouter,
});

export type AppRouter = typeof appRouter;
