import type { Metadata } from "next";
import { InvestorDashboard } from "@/components/investor-dashboard";

export const metadata: Metadata = { title: "Funder desk" };

export default function Page() {
  return <InvestorDashboard />;
}
