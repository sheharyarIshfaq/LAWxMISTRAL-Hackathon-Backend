"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;
export const SheetTitle = Dialog.Title;

export function SheetContent({
  className,
  children,
  side = "left",
  ...props
}: ComponentProps<typeof Dialog.Content> & { side?: "left" | "right" }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20" />
      <Dialog.Content
        className={cn(
          "fixed z-50 h-full w-72 bg-sidebar shadow-xl",
          side === "left" ? "inset-y-0 left-0" : "inset-y-0 right-0",
          className,
        )}
        {...props}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
