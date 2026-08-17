import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createTRPCContext } from "@forkd/api";
import { deletePhotoFiles } from "@/lib/photoStorage";
import { deleteReceiptFiles } from "@/lib/receiptStorage";
import {
  clearOrphanedVideos,
  deleteUploadFile,
  getStorageUsage,
  listAllUploadFiles,
} from "@/lib/storageStats";
import {
  backupAndOptimizePhoto,
  deleteOriginals,
  originalsSizeBytes,
  restoreOriginal,
} from "@/lib/photoOptimize";
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
          deleteReceiptFiles,
          getStorageUsage,
          listAllUploadFiles,
          deleteUploadFile,
          clearOrphanedVideos,
          backupAndOptimizePhoto,
          restoreOriginal,
          deleteOriginals,
          originalsSizeBytes,
        },
        shutdownFn: requestShutdown,
      }),
  });

export { handler as GET, handler as POST };
