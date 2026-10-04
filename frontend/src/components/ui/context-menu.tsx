"use client";

import * as Menu from "@radix-ui/react-context-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const ContextMenu = Menu.Root;
export const ContextMenuTrigger = Menu.Trigger;

export function ContextMenuContent({ className, ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        className={cn("z-50 min-w-48 rounded-xl border border-line bg-white p-1 shadow-lg", className)}
        {...props}
      />
    </Menu.Portal>
  );
}

export function ContextMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer items-center rounded-lg px-2 py-2 text-sm text-paper outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-elevated",
        className,
      )}
      {...props}
    />
  );
}

export function ContextMenuSeparator({ className, ...props }: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("my-1 h-px bg-line", className)} {...props} />;
}
