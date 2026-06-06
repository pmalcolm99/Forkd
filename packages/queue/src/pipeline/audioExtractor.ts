import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function extractAudio(videoPath: string, outputDir: string): Promise<string> {
  const audioPath = path.join(outputDir, "audio.opus");
  await execFileAsync(
    "ffmpeg",
    ["-i", videoPath, "-vn", "-acodec", "libopus", "-b:a", "32k", audioPath],
    { timeout: 60_000 }
  );
  return audioPath;
}
