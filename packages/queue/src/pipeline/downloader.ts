import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function downloadVideo(
  url: string,
  outputDir: string,
  maxSeconds: number
): Promise<string> {
  const binDir = process.env.YT_DLP_BIN_DIR ?? "/usr/local/bin";
  const ytdlp = path.join(binDir, "yt-dlp");
  const outputTemplate = path.join(outputDir, "video.%(ext)s");

  await execFileAsync(
    ytdlp,
    [
      "--match-filter",
      `duration <= ${maxSeconds}`,
      "--no-playlist",
      "-f",
      "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "-o",
      outputTemplate,
      url,
    ],
    { timeout: 120_000 }
  );

  const files = await readdir(outputDir);
  const video = files.find((f) => f.startsWith("video."));
  if (!video) throw new Error("yt-dlp succeeded but produced no output file");
  return path.join(outputDir, video);
}
