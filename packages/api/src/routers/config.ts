import { TRPCError } from "@trpc/server";
import z from "zod";
import { appConfig } from "@forkd/db";
import { logger } from "@forkd/shared";
import { encrypt } from "../crypto";
import { adminProcedure, ownerProcedure, router } from "../trpc";
import { CONFIG_KEYS, CONFIG_KEY_MAP, configKeyEnum } from "../config/keys";
import { getDecryptedConfigValue } from "../config/read";

// 1-second silent MPEG1 Layer3 mono 32kbps 44100Hz MP3 — embedded for standalone-build
// compatibility (packages/ files are not copied into Next.js standalone output).
// Regenerate with: ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -q:a 9 -acodec libmp3lame silence.mp3
// then: base64 -i silence.mp3
const SILENCE_MP3_BASE64 =
  "//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7QMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export const configRouter = router({
  get: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(appConfig);
    const rowMap = new Map(rows.map((r) => [r.key, r]));

    return CONFIG_KEYS.map((def) => {
      const row = rowMap.get(def.key);
      let displayValue: string;
      if (!row) {
        displayValue = "";
      } else if (def.isSecret) {
        displayValue = "***";
      } else {
        displayValue = row.value;
      }
      return {
        key: def.key,
        isSecret: def.isSecret,
        requiredRole: def.requiredRole as "admin" | "owner",
        isSet: !!row,
        displayValue,
        defaultValue: "defaultValue" in def ? (def.defaultValue ?? null) : null,
      };
    });
  }),

  set: adminProcedure
    .input(z.object({ key: configKeyEnum, value: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const def = CONFIG_KEY_MAP.get(input.key)!;

      if (def.requiredRole === "owner" && !ctx.user.isOwner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner-only configuration key" });
      }

      if ("validator" in def && def.validator) {
        const result = def.validator.safeParse(input.value);
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error.issues[0]?.message ?? "Invalid value",
          });
        }
      }

      const storedValue = def.isSecret ? encrypt(input.value) : input.value;

      logger.info(
        { event: "config_set", key: input.key, userId: ctx.user.id },
        "Config key updated"
      );

      await ctx.db
        .insert(appConfig)
        .values({
          key: input.key,
          value: storedValue,
          isSecret: def.isSecret,
          updatedByUserId: ctx.user.id,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: appConfig.key,
          set: {
            value: storedValue,
            updatedByUserId: ctx.user.id,
            updatedAt: new Date(),
          },
        });

      return { ok: true };
    }),

  testClaude: adminProcedure.mutation(async ({ ctx }) => {
    const apiKey = await getDecryptedConfigValue("ai.claude.api_key", ctx.db);
    if (!apiKey) return { ok: false, error: "API key not configured" };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (resp.ok) return { ok: true };
      if (resp.status === 401) return { ok: false, error: "Invalid API key" };
      if (resp.status === 403) return { ok: false, error: "API key lacks permission" };
      return { ok: false, error: `API returned ${resp.status}` };
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: "Request timed out" };
      }
      return { ok: false, error: "Connection failed" };
    }
  }),

  testWhisper: adminProcedure.mutation(async ({ ctx }) => {
    const apiKey = await getDecryptedConfigValue("transcription.api_key", ctx.db);
    if (!apiKey) return { ok: false, error: "API key not configured" };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30_000);

    try {
      const body = new FormData();
      body.append(
        "file",
        new Blob([Buffer.from(SILENCE_MP3_BASE64, "base64")], { type: "audio/mpeg" }),
        "silence.mp3"
      );
      body.append("model", "whisper-1");

      const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body,
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (resp.ok) return { ok: true };
      if (resp.status === 401) return { ok: false, error: "Invalid API key" };
      return { ok: false, error: `API returned ${resp.status}` };
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: "Request timed out" };
      }
      return { ok: false, error: "Connection failed" };
    }
  }),

  testGooglePlaces: adminProcedure.mutation(async ({ ctx }) => {
    const apiKey = await getDecryptedConfigValue("google_places.api_key", ctx.db);
    if (!apiKey) return { ok: false, error: "API key not configured" };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);

    try {
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=pizza+near+New+York&key=${apiKey}`;
      const resp = await fetch(url, { signal: ac.signal });
      clearTimeout(timer);
      if (!resp.ok) return { ok: false, error: `API returned ${resp.status}` };
      const json = (await resp.json()) as { status?: string };
      if (json.status === "REQUEST_DENIED") return { ok: false, error: "Invalid API key" };
      return { ok: true };
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: "Request timed out" };
      }
      return { ok: false, error: "Connection failed" };
    }
  }),

  restartServer: ownerProcedure.mutation(({ ctx }) => {
    const scheduledAt = new Date();
    logger.info(
      { event: "restart_requested", actorId: ctx.user.id, scheduledAt },
      "Server restart requested via admin UI"
    );

    // Respond to the client first, then trigger shutdown after 500 ms so the
    // HTTP response has time to reach the browser before the process exits.
    setTimeout(() => {
      void ctx.shutdownFn?.("admin-ui restart", ctx.user.id).catch((err: unknown) => {
        logger.error({ err }, "Shutdown function failed, forcing exit");
        process.exit(0);
      });
    }, 500);

    return { ok: true, scheduledAt };
  }),
});
