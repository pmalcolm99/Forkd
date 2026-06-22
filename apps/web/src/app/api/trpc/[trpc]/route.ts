import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createTRPCContext } from "@forkd/api";
import { deletePhotoFiles } from "@/lib/photoStorage";
import {
  clearOrphanedVideos,
  deleteUploadFile,
  getStorageUsage,
  listAllUploadFiles,
} from "@/lib/storageStats";
import { requestShutdown } from "@/server/shutdown"; // registers SIGTERM/SIGINT as side effect

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () =>
      createTRPCContext({
        req,
        fileStore: {
          deletePhotoFiles,
          getStorageUsage,
          listAllUploadFiles,
          deleteUploadFile,
          clearOrphanedVideos,
        },
        shutdownFn: requestShutdown,
      }),
  });

export { handler as GET, handler as POST };
