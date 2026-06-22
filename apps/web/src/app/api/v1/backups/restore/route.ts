export const dynamic = "force-dynamic";

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { auth } from "@forkd/auth";
import { db, user } from "@forkd/db";
import { backupQueue } from "@forkd/queue";

// Uploaded archives can be large; allow up to 2 GB.
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const rows = await db
    .select({ isOwner: user.isOwner })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  if (!rows[0]?.isOwner) return new Response("Forbidden", { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ message: "No file provided" }, { status: 400 });
  }
  if (!file.name.endsWith(".tar.gz")) {
    return Response.json({ message: "Backup must be a .tar.gz archive" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ message: "Backup file is too large" }, { status: 413 });
  }

  // Stage the upload to a temp file, then enqueue the restore job.
  const dir = await mkdtemp(path.join(tmpdir(), "forkd-restore-upload-"));
  const archivePath = path.join(dir, "upload.tar.gz");
  await writeFile(archivePath, Buffer.from(await file.arrayBuffer()));

  const job = await backupQueue.add("restore", { type: "restore", archivePath });
  return Response.json({ jobId: String(job.id) });
}
