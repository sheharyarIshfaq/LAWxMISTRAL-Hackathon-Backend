import type { Metadata } from "next";
import { InvestorDashboard } from "@/components/investor-dashboard";

export const metadata: Metadata = { title: "Pitch" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvestorDashboard entryNav="ai" matterId={id} />;
}
