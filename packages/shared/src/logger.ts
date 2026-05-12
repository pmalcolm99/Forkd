import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["password", "token", "apiKey", "api_key", "secret", "authorization", "cookie"],
    censor: "[REDACTED]",
  },
  transport: isDev ? { target: "pino-pretty", options: { colorize: true } } : undefined,
});
