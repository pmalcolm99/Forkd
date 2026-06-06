import { createReadStream } from "node:fs";
import OpenAI from "openai";
import type { db as dbType } from "@forkd/db";
import { getDecryptedConfigValue } from "@forkd/db";

export async function transcribeAudio(audioPath: string, db: typeof dbType): Promise<string> {
  const apiKey = await getDecryptedConfigValue("transcription.api_key", db);
  if (!apiKey) throw new Error("Whisper not configured: transcription.api_key is not set");

  const cfgModel = await getDecryptedConfigValue("transcription.model", db);
  const model = cfgModel ?? process.env.TRANSCRIPTION_MODEL ?? "whisper-1";

  const client = new OpenAI({ apiKey });
  const result = await client.audio.transcriptions.create({
    file: createReadStream(audioPath) as Parameters<
      typeof client.audio.transcriptions.create
    >[0]["file"],
    model,
    response_format: "text",
  });
  return typeof result === "string" ? result : (result as { text: string }).text;
}
