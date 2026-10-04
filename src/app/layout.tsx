import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { Providers } from "@/lib/store";
import "./globals.css";

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
      className="h-full antialiased"
    >
      <body className="min-h-full">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
