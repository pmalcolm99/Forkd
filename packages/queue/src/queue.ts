import { Queue } from "bullmq";
import { getRedisOptions } from "./redis";

export type ImportJobData = {
  jobId: string;
  sourceUrl: string;
  userId: string;
};

export const importQueue = new Queue<ImportJobData>("import", {
  connection: getRedisOptions(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
