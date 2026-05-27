export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

// Smart redirect: routes to the appropriate sign-in path based on the environment.
// In production (CF_ACCESS_ENABLED=true) middleware intercepts before this page runs,
// but this handles the fallback case gracefully.
export default function SignInPage() {
  if (process.env.CF_ACCESS_ENABLED === "true") {
    redirect("/api/auth/cloudflare-sync");
  }
  redirect("/dev/select-user");
}
