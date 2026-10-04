import type { Metadata } from "next";
import { NgoDashboard } from "@/components/ngo-dashboard";

export const metadata: Metadata = { title: "Funders" };

export default function Page() {
  return <NgoDashboard entryNav="investors" />;
}
