import type { Metadata } from "next";
import { NgoDashboard } from "@/components/ngo-dashboard";

export const metadata: Metadata = { title: "Case" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NgoDashboard entryNav="pitches" matterId={id} />;
}
