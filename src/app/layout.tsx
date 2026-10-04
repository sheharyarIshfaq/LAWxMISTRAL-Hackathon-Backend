import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Instrument_Sans, JetBrains_Mono, Newsreader } from "next/font/google";
import { Shell } from "@/components/shell";
import "./globals.css";

// Editorial serif for headings, a clean grotesque for reading, a mono for figures.
const display = Newsreader({ subsets: ["latin"], variable: "--font-display", style: ["normal", "italic"] });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" });

export const metadata: Metadata = {
  title: {
    default: "Bina.ai",
    template: "%s · Bina.ai",
  },
  description:
    "CNIL data-breach sanctions turned into fundable collective actions: radar, decision summary, funding brief, funder matching.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="min-h-full">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
