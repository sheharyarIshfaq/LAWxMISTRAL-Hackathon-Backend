"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Gavel, Scale, ShieldCheck, Users } from "lucide-react";
import { ApiError, chatStream, getCase, type ChatCitation, type ChatTurn } from "@/lib/api";
import { AgentActivity, type LiveStep } from "@/components/agent-activity";
import { Logo } from "@/components/logo";
import { proseClass, renderMarkdown } from "@/lib/markdown";

type Message = ChatTurn & {
  citations?: ChatCitation[];
  steps?: LiveStep[];
  thinking?: string;
  live?: boolean;
  error?: boolean;
};

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// Each quoted passage ends with "(p. N)"; the backend returns one citation per passage, in order.
// The marker becomes an inline § chip linking to the passage on Légifrance, and the quote is set in the decision's voice.
function withCitationChips(html: string, citations: ChatCitation[] = []) {
  let i = 0;
  return html.replace(
    /(?:(&quot;|"|“|«)([^<]{8,}?)(&quot;|"|”|»)\s*)?\(p\.\s*(\d+)([^)]*)\)/g,
    (_m, _o, quote: string | undefined, _c, page: string) => {
      const c = citations[i++];
      const warn = c ? !c.verified : false;
      const label = `${warn ? "⚠ " : ""}${c?.paragraph ?? `p. ${page}`}`;
      const title = warn
        ? "Could not be verified against the decision"
        : c?.url
          ? `Open the passage in the decision (${/legifrance/.test(c.url) ? "Légifrance" : "PDF"})`
          : `Page ${page} of the decision`;
      const chip = c?.url
        ? `<a class="cite${warn ? " cite-warn" : ""}" href="${esc(c.url)}" target="_blank" rel="noopener" title="${title}">${label}</a>`
        : `<span class="cite${warn ? " cite-warn" : ""}" title="${title}">${label}</span>`;
      return `${quote ? `<span class="dq">“${quote}”</span>` : ""}${chip}`;
    },
  );
}

const SUGGESTIONS = [
  {
    icon: Users,
    text: "Combien de personnes sont concernées et quelles données ont fuité ?",
  },
  { icon: ShieldCheck, text: "Were the victims informed, and how?" },
  {
    icon: Gavel,
    text: "What did the CNIL say about the harm to the people concerned?",
  },
  { icon: Scale, text: "What is the chance of winning a class action?" },
];

// For decisions of other authorities (e.g. a European Commission DMA decision).
const SUGGESTIONS_OTHER = [
  { icon: Users, text: "Which businesses are disadvantaged by the conduct, and how?" },
  { icon: ShieldCheck, text: "Since when does the non-compliance run, and is it ongoing?" },
  { icon: Gavel, text: "What does the decision say about the effects on competitors?" },
  { icon: Scale, text: "What is the chance of winning a class action?" },
];

// Chat over one decision: answers only from the decision, every quote checked by the backend, no chance of winning.
// Fills the height of its container: messages scroll, the composer stays at the bottom.
export function CaseChat({
  caseId,
  attachment,
}: {
  caseId: string;
  attachment?: ReactNode;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const [authority, setAuthority] = useState("CNIL");
  useEffect(() => {
    getCase(caseId).then((c) => setAuthority(c.decision.regulator)).catch(() => null);
  }, [caseId]);
  const suggestions = authority === "CNIL" ? SUGGESTIONS : SUGGESTIONS_OTHER;

  useEffect(() => {
    if (messages.length)
      end.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history: ChatTurn[] = messages
      .filter((m) => !m.error)
      .map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    // The assistant message is created at once and filled as events stream in.
    setMessages((m) => [...m, { role: "assistant", content: "", steps: [], thinking: "", live: true }]);
    const update = (fn: (m: Message) => Message) =>
      setMessages((all) => {
        const next = [...all];
        next[next.length - 1] = fn(next[next.length - 1]);
        return next;
      });
    try {
      await chatStream(caseId, q, history, (e) => {
        if (e.type === "step")
          update((m) => {
            const steps = [...(m.steps ?? [])];
            const i = steps.findIndex((s) => s.id === e.id);
            const row = { id: e.id, label: e.label, detail: e.detail, status: e.status };
            if (i === -1) steps.push(row);
            else steps[i] = row;
            return { ...m, steps };
          });
        else if (e.type === "thinking") update((m) => ({ ...m, thinking: (m.thinking ?? "") + e.text }));
        else if (e.type === "text") update((m) => ({ ...m, content: m.content + e.text }));
        else if (e.type === "done") update((m) => ({ ...m, content: e.answer, citations: e.citations, live: false }));
        else if (e.type === "error") update((m) => ({ ...m, content: e.message, error: true, live: false }));
      });
      update((m) => ({ ...m, live: false }));
    } catch (e) {
      update((m) => ({ ...m, content: (e as ApiError).message, error: true, live: false }));
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
              <h2 className="mt-5 font-serif text-3xl text-paper">
                What would you like to know?
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-faint">
                Answers come only from the {authority} decision, with quotes checked
                word for word against it. No chance of winning is ever given.
              </p>
              <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                {suggestions.map(({ icon: Icon, text }, i) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => send(text)}
                    className={`rise rise-${i + 1} group flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-panel p-4 text-left text-sm text-muted shadow-[0_1px_0_rgba(23,43,77,0.04)] transition hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-[0_10px_30px_rgba(23,43,77,0.08)]`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky/70 text-gold">
                      <Icon className="size-4" />
                    </span>
                    <span className="leading-snug group-hover:text-paper">
                      {text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-6">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="rise flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-paper px-4 py-3 text-[15px] leading-relaxed text-white shadow-sm">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="rise flex items-start gap-3">
                  <span className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-line">
                    <Logo size={22} />
                  </span>
                  <div
                    className={`min-w-0 flex-1 rounded-2xl rounded-tl-md border px-5 py-4 shadow-[0_1px_0_rgba(23,43,77,0.04)] ${
                      m.error
                        ? "border-[#fecdca] bg-[#fef3f2] text-sm text-[#b42318]"
                        : "border-line bg-panel"
                    }`}
                  >
                    {!m.error ? <AgentActivity steps={m.steps} thinking={m.thinking} running={m.live} /> : null}
                    {m.live && !m.content ? (
                      <span className="inline-flex items-center gap-1.5 py-1">
                        <span className="dot" />
                        <span className="dot" />
                        <span className="dot" />
                      </span>
                    ) : null}
                    {m.error ? (
                      m.content
                    ) : (
                      <div
                        className={proseClass}
                        dangerouslySetInnerHTML={{
                          __html: m.live
                            ? renderMarkdown(m.content).replace(/(<\/p>\s*)?$/, '<span class="caret"></span>$1')
                            : withCitationChips(renderMarkdown(m.content), m.citations),
                        }}
                      />
                    )}
                    {m.citations?.length ? (
                      <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-[12px] text-faint">
                        <ShieldCheck className="size-3.5 text-[#067647]" />
                        {m.citations.filter((c) => c.verified).length} of{" "}
                        {m.citations.length} quote
                        {m.citations.length > 1 ? "s" : ""} checked word for
                        word against the decision
                      </p>
                    ) : null}
                  </div>
                </div>
              ),
            )}

            <div ref={end} />
          </div>
        </div>
      </div>

      <div className="border-t border-line bg-ink/80 px-4 py-4 backdrop-blur md:px-6">
        <form
          className="mx-auto max-w-3xl rounded-2xl border border-line bg-panel p-2 shadow-[0_8px_30px_rgba(23,43,77,0.06)] focus-within:border-gold/50"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          {attachment ? (
            <div className="px-1 pb-1 pt-0.5">{attachment}</div>
          ) : null}
          <div className="flex items-end gap-2">
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
          </div>
        </form>
        <p className="mx-auto mt-2 max-w-3xl px-1 text-center text-[11px] text-faint">
          Answers cite the paragraphs of the decision · Enter to send, Shift +
          Enter for a new line
        </p>
      </div>
    </div>
  );
}
