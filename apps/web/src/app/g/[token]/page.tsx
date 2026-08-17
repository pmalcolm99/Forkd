import { GuestClaimPage } from "./GuestClaimPage";

export const metadata = {
  title: "Your share · Forkd",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Guest bill-split link.
 *
 * This is the one route in Forkd that renders for someone without a Forkd
 * account — the Cloudflare Access bypass for /g/* is what makes it reachable.
 * All of its data comes from the token-scoped /api/v1/guest/* endpoints; it
 * never touches tRPC, which stays entirely behind Access.
 */
export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestClaimPage token={token} />;
}
