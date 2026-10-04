"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { ApiError, chat, type ChatCitation, type ChatTurn } from "@/lib/api";
import { proseClass, renderMarkdown } from "@/lib/markdown";

type Message = ChatTurn & { citations?: ChatCitation[]; error?: boolean };

const SUGGESTIONS = [
  "Combien de personnes sont concernées et quelles données ont fuité ?",
  "Were the victims informed, and how?",
  "What did the CNIL say about the harm to the people concerned?",
  "What is the chance of winning a class action?",
];

// Chatbot over one decision: answers only from the decision, every quote checked by the backend, no chance of winning.
export function CaseChat({ caseId, defendant }: { caseId: string; defendant: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history: ChatTurn[] = messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    try {
      const r = await chat(caseId, q, history);
      setMessages((m) => [...m, { role: "assistant", content: r.answer, citations: r.citations }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: (e as ApiError).message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-panel p-5">
      <p className="text-[13px] text-faint">
        Ask anything about the CNIL decision{defendant ? ` against ${defendant}` : ""}. Answers come only from the decision, with quotes checked word for word. No
        chance of winning is ever given.
      </p>

      <div className="mt-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="cursor-pointer rounded-full bg-elevated px-3 py-1.5 text-left text-[13px] text-muted hover:bg-hover">
                {s}
              </button>
            ))}
          </div>
        ) : null}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[80%] rounded-2xl bg-fill px-4 py-2.5 text-sm text-white">
              {m.content}
            </div>
          ) : (
            <div key={i} className={`max-w-[92%] rounded-2xl px-4 py-3 ${m.error ? "bg-[#fee4e2] text-sm text-[#b42318]" : "bg-ink"}`}>
              {m.error ? m.content : <div className={proseClass} dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />}
              {m.citations?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.citations.map((c, k) => (
                    <span
                      key={k}
                      title={c.quote}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c.verified ? "bg-[#dcfae6] text-[#085d3a]" : "bg-[#fef0c7] text-[#93370d]"}`}
                    >
                      {c.verified ? "✓" : "⚠"} {c.paragraph ?? `p. ${c.page}`}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )
        )}
        {busy ? <p className="text-sm text-faint">Reading the decision…</p> : null}
        <div ref={end} />
      </div>

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder="Ask about the decision, in French or English…"
          className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-gold"
        />
        <button type="submit" disabled={busy || !input.trim()} className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl bg-fill text-white disabled:opacity-40">
          <ArrowUp className="size-5" />
        </button>
      </form>
    </div>
  );
}
