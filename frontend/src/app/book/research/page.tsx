import type { Metadata } from "next";
import { InvestorDashboard } from "@/components/investor-dashboard";

export const metadata: Metadata = { title: "Pitches" };

export default function Page() {
  return <InvestorDashboard entryNav="ai" />;
}
