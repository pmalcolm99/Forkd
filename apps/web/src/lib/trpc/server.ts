import { headers } from "next/headers";
import { createCallerFactory, appRouter } from "@forkd/api";
import { db } from "@forkd/db";
import { auth } from "@forkd/auth";

const createCaller = createCallerFactory(appRouter);

export const serverTrpc = async () => {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  return createCaller({
    db,
    session: session?.session ?? null,
    user: session?.user ?? null,
  });
};
