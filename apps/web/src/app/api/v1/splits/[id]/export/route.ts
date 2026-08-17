import z from "zod";
import { auth } from "@forkd/auth";
import { db } from "@forkd/db";
import { buildSplitView } from "@forkd/api/splits";
import { buildSplitCsv, splitCsvFilename } from "@forkd/shared";

export const dynamic = "force-dynamic";

/**
 * Download a bill as CSV.
 *
 * A REST route rather than a tRPC procedure because the browser needs to receive
 * this as a file: tRPC responses are JSON over fetch, so a download would mean
 * building a Blob client-side and synthesising a link. A plain GET with
 * Content-Disposition lets the anchor do it, and works with the OS share sheet
 * on a phone.
 *
 * Access matches `splits.get` — any signed-in Forkd user — so the export can
 * never expose a bill the same person could not already open in the UI.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const sessionData = await auth.api.getSession({ headers: req.headers });
  if (!sessionData?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return new Response("Not Found", { status: 404 });
  }

  const view = await buildSplitView(db, id, { viewerUserId: sessionData.user.id });
  if (!view) return new Response("Not Found", { status: 404 });

  const payer = view.participants.find((p) => p.id === view.paidByParticipantId) ?? null;

  const csv = buildSplitCsv({
    title: view.title,
    merchantName: view.merchantName,
    restaurantName: view.restaurant?.name ?? null,
    purchasedAt: view.purchasedAt,
    currency: view.currency,
    homeCurrency: view.homeCurrency,
    effectiveFxRate: view.effectiveFxRate,
    totalCents: view.totalCents,
    payerName: payer?.displayName ?? null,
    participants: view.participants,
    items: view.items,
    math: view.math,
  });

  const filename = splitCsvFilename(view.title, view.purchasedAt);

  return new Response(
    // Excel assumes the system codepage unless a UTF-8 byte-order mark is
    // present, which turns "Gasthaus Pöschl" into mojibake and mangles the €
    // sign. The BOM costs three bytes and every other spreadsheet app ignores it.
    "﻿" + csv,
    {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
