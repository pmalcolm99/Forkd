import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function extractAudio(videoPath: string, outputDir: string): Promise<string> {
  const audioPath = path.join(outputDir, "audio.m4a");
  // aac is ffmpeg's native encoder (no external library) — always available on Alpine.
  // m4a is in Whisper's supported format list; .opus is not.
  await execFileAsync("ffmpeg", ["-i", videoPath, "-vn", "-c:a", "aac", "-b:a", "64k", audioPath], {
    timeout: 60_000,
  });
  return audioPath;
}
