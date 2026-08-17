import { SplitDetail } from "../_components/SplitDetail";

export const metadata = { title: "Bill · Forkd" };

export default async function SplitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scanned?: string }>;
}) {
  const { id } = await params;
  const { scanned } = await searchParams;
  return <SplitDetail splitId={id} justScanned={scanned === "1"} />;
}
