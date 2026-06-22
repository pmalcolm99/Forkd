import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { configRouter } from "./routers/config";
import { cuisinesRouter } from "./routers/cuisines";
import { importRouter } from "./routers/import";
import { usersRouter } from "./routers/users";
import { restaurantsRouter } from "./routers/restaurants";
import { reviewsRouter } from "./routers/reviews";
import { photosRouter } from "./routers/photos";
import { storageRouter } from "./routers/storage";
import { statsRouter } from "./routers/stats";
import { backupsRouter } from "./routers/backups";

export const appRouter = router({
  auth: authRouter,
  config: configRouter,
  cuisines: cuisinesRouter,
  import: importRouter,
  users: usersRouter,
  restaurants: restaurantsRouter,
  reviews: reviewsRouter,
  photos: photosRouter,
  storage: storageRouter,
  stats: statsRouter,
  backups: backupsRouter,
});

export type AppRouter = typeof appRouter;
