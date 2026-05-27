export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { serverTrpc } from "@/lib/trpc/server";

export default async function HomePage() {
  const caller = await serverTrpc();
  // Determine the redirect target before calling redirect() — redirect() works by
  // throwing a NEXT_REDIRECT error, so it must not be called inside try/catch or
  // the catch block will intercept it and swallow the successful redirect.
  let target = "/sign-in";
  try {
    const me = await caller.auth.me();
    target = me.firstName && me.lastName ? "/restaurants" : "/welcome";
  } catch {
    // No session or auth error — send to sign-in.
  }
  redirect(target);
}
