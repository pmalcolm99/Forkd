export const dynamic = "force-dynamic";

import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { auth } from "@forkd/auth";
import { db, user } from "@forkd/db";

const FILENAME_RE = /^forkd-backup-[\w.:-]+\.tar\.gz$/;

async function requireOwner(req: Request): Promise<boolean> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return false;
  const rows = await db
    .select({ isOwner: user.isOwner })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  return !!rows[0]?.isOwner;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
): Promise<Response> {
  if (!(await requireOwner(req))) return new Response("Forbidden", { status: 403 });

  const { filename } = await params;
  if (!FILENAME_RE.test(filename)) return new Response("Bad request", { status: 400 });

  const dir = process.env.BACKUPS_DIR ?? "/app/backups";
  const filePath = path.join(dir, filename);
  if (!existsSync(filePath)) return new Response("Not found", { status: 404 });

  const { size } = await stat(filePath);
  const nodeStream = createReadStream(filePath);
  const stream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(chunk));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
