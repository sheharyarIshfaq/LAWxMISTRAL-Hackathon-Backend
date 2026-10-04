"use client";

import * as Hover from "@radix-ui/react-hover-card";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const HoverCard = Hover.Root;
export const HoverCardTrigger = Hover.Trigger;

export function HoverCardContent({ className, ...props }: ComponentProps<typeof Hover.Content>) {
  return (
    <Hover.Portal>
      <Hover.Content
        className={cn("z-50 rounded-xl border border-line bg-white p-1 shadow-lg", className)}
        {...props}
      />
    </Hover.Portal>
  );
}
