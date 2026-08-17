import { ShareClaimPage } from "@/app/splits/_components/ShareClaimPage";

export const metadata = {
  title: "Pick your items · Forkd",
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareClaimPage token={token} />;
}
