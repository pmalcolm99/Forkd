export type RedisConnectionOptions = {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest: null;
};

let _options: RedisConnectionOptions | null = null;

export function getRedisOptions(): RedisConnectionOptions {
  if (_options) return _options;
  const raw = process.env.REDIS_URL ?? "redis://localhost:6379";
  const url = new URL(raw);
  _options = {
    host: url.hostname,
    port: parseInt(url.port || "6379", 10),
    maxRetriesPerRequest: null,
  };
  if (url.password) _options.password = decodeURIComponent(url.password);
  if (url.pathname && url.pathname !== "/") {
    const dbNum = parseInt(url.pathname.slice(1), 10);
    if (!isNaN(dbNum)) _options.db = dbNum;
  }
  return _options;
}
