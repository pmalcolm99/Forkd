import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createTRPCContext } from "@forkd/api";
import { deletePhotoFiles } from "@/lib/photoStorage";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ req, fileStore: { deletePhotoFiles } }),
  });

export { handler as GET, handler as POST };
