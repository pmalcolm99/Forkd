export const dynamic = "force-dynamic";

import { eq } from "drizzle-orm";
import { auth } from "@forkd/auth";
import { db, user } from "@forkd/db";
import { buildExportDocument } from "@/lib/restaurantTransfer";

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const rows = await db
    .select({ isOwner: user.isOwner })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);
  if (!rows[0]?.isOwner) return new Response("Forbidden", { status: 403 });

  const doc = await buildExportDocument();
  const dateStr = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(doc, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="forkd-export-${dateStr}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
