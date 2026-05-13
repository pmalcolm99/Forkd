import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { cuisinesRouter } from "./routers/cuisines";
import { usersRouter } from "./routers/users";
import { restaurantsRouter } from "./routers/restaurants";
import { reviewsRouter } from "./routers/reviews";
import { photosRouter } from "./routers/photos";

export const appRouter = router({
  auth: authRouter,
  cuisines: cuisinesRouter,
  users: usersRouter,
  restaurants: restaurantsRouter,
  reviews: reviewsRouter,
  photos: photosRouter,
});

export type AppRouter = typeof appRouter;
