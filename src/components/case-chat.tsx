"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Gavel, Scale, ShieldCheck, Users } from "lucide-react";
import { ApiError, chat, type ChatCitation, type ChatTurn } from "@/lib/api";
import { Logo } from "@/components/logo";
import { proseClass, renderMarkdown } from "@/lib/markdown";

type Message = ChatTurn & { citations?: ChatCitation[]; error?: boolean };

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// Each quoted passage ends with "(p. N)"; the backend returns one citation per passage, in order.
// The marker becomes an inline § chip linking to the passage on Légifrance, and the quote is set in the decision's voice.
function withCitationChips(html: string, citations: ChatCitation[] = []) {
  let i = 0;
  return html.replace(/(?:(&quot;|"|“|«)([^<]{8,}?)(&quot;|"|”|»)\s*)?\(p\.\s*(\d+)([^)]*)\)/g, (_m, _o, quote: string | undefined, _c, page: string) => {
    const c = citations[i++];
    const warn = c ? !c.verified : false;
    const label = `${warn ? "⚠ " : ""}${c?.paragraph ?? `p. ${page}`}`;
    const title = warn ? "Could not be verified against the decision" : c?.url ? "Open the passage on Légifrance" : `Page ${page} of the decision`;
    const chip = c?.url
      ? `<a class="cite${warn ? " cite-warn" : ""}" href="${esc(c.url)}" target="_blank" rel="noopener" title="${title}">${label}</a>`
      : `<span class="cite${warn ? " cite-warn" : ""}" title="${title}">${label}</span>`;
    return `${quote ? `<span class="dq">“${quote}”</span>` : ""}${chip}`;
  });
}

const SUGGESTIONS = [
  { icon: Users, text: "Combien de personnes sont concernées et quelles données ont fuité ?" },
  { icon: ShieldCheck, text: "Were the victims informed, and how?" },
  { icon: Gavel, text: "What did the CNIL say about the harm to the people concerned?" },
  { icon: Scale, text: "What is the chance of winning a class action?" },
];

// Chat over one decision: answers only from the decision, every quote checked by the backend, no chance of winning.
// Fills the height of its container: messages scroll, the composer stays at the bottom.
export function CaseChat({ caseId }: { caseId: string; defendant?: string }) {
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6">
        <div className="mx-auto max-w-3xl py-6">
          {messages.length === 0 ? (
            <div className="rise flex flex-col items-center pt-6 text-center">
              <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-b from-white to-sky shadow-[0_8px_30px_rgba(23,43,77,0.12)] ring-1 ring-line">
                <Logo size={44} />
              </div>
              <h2 className="mt-5 font-serif text-3xl text-paper">What would you like to know?</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-faint">
                Answers come only from the CNIL decision, with quotes checked word for word against it. No chance of winning is ever given.
              </p>
              <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                {SUGGESTIONS.map(({ icon: Icon, text }, i) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => send(text)}
                    className={`rise rise-${i + 1} group flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-panel p-4 text-left text-sm text-muted shadow-[0_1px_0_rgba(23,43,77,0.04)] transition hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-[0_10px_30px_rgba(23,43,77,0.08)]`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky/70 text-gold">
                      <Icon className="size-4" />
                    </span>
                    <span className="leading-snug group-hover:text-paper">{text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-6">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="rise flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-paper px-4 py-3 text-[15px] leading-relaxed text-white shadow-sm">{m.content}</div>
                </div>
              ) : (
                <div key={i} className="rise flex items-start gap-3">
                  <span className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-line">
                    <Logo size={22} />
                  </span>
                  <div
                    className={`min-w-0 flex-1 rounded-2xl rounded-tl-md border px-5 py-4 shadow-[0_1px_0_rgba(23,43,77,0.04)] ${
                      m.error ? "border-[#fecdca] bg-[#fef3f2] text-sm text-[#b42318]" : "border-line bg-panel"
                    }`}
                  >
                    {m.error ? m.content : <div className={proseClass} dangerouslySetInnerHTML={{ __html: withCitationChips(renderMarkdown(m.content), m.citations) }} />}
                    {m.citations?.length ? (
                      <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-[12px] text-faint">
                        <ShieldCheck className="size-3.5 text-[#067647]" />
                        {m.citations.filter((c) => c.verified).length} of {m.citations.length} quote{m.citations.length > 1 ? "s" : ""} checked word for word against the decision
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            )}
            {busy ? (
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-line">
                  <Logo size={22} />
                </span>
                <div className="flex items-center gap-1.5 rounded-2xl border border-line bg-panel px-4 py-3">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <span className="ml-2 text-[13px] text-faint">Reading the decision…</span>
                </div>
              </div>
            ) : null}
            <div ref={end} />
          </div>
        </div>
      </div>

      <div className="border-t border-line bg-ink/80 px-4 py-4 backdrop-blur md:px-6">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-line bg-panel p-2 shadow-[0_8px_30px_rgba(23,43,77,0.06)] focus-within:border-gold/50"
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
            rows={1}
            placeholder="Ask about the decision, in French or English…"
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-paper outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={busy || !input.trim()}
            className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-fill text-white transition hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUp className="size-5" />
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl px-1 text-center text-[11px] text-faint">Answers cite the paragraphs of the decision · Enter to send, Shift + Enter for a new line</p>
      </div>
    </div>
  );
}
