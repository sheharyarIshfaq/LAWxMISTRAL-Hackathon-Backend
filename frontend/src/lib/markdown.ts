import { marked } from "marked";

// Markdown from the backend (summary, chat answers): links open in a new tab.
export function renderMarkdown(md: string) {
  return (marked.parse(md, { async: false }) as string).replace(/<a href=/g, '<a target="_blank" rel="noopener" href=');
}

export const proseClass =
  "text-[15px] leading-relaxed text-muted [&_a]:font-semibold [&_a]:text-gold [&_a]:no-underline [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-paper [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-paper [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-paper [&_h4]:mt-4 [&_h4]:font-semibold [&_h4]:text-paper [&_p]:my-2.5 [&_strong]:text-paper [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-faint";

