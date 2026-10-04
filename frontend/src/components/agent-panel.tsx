"use client";

import { CaseChat } from "@/components/case-chat";
import { CaseAttach } from "@/components/case-attach";

// Full-height agent page shared by both desks; the attached case sits in the chat input box.
export function AgentPanel({
  options,
  value,
  onChange,
  empty,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  empty: string;
}) {
  if (!value) return <p className="mx-auto mt-16 max-w-sm px-4 text-center text-sm text-faint">{empty}</p>;
  return (
    <div className="flex h-full flex-col">
      <CaseChat key={value} caseId={value} attachment={<CaseAttach options={options} value={value} onChange={onChange} />} />
    </div>
  );
}
