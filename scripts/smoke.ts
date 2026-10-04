// Pre-demo check: calls every endpoint for one case against a running server and reports what works.
// Usage: npm run dev (other terminal), then: npm run smoke [-- <case-id>] [-- --chat]
const BASE = process.env.API_URL ?? "http://localhost:3001";
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--")) ?? "free-mobile-2026";
const withChat = args.includes("--chat");

let failed = 0;
async function check(name: string, path: string, test: (r: Response, body: any) => string | true, init?: RequestInit) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + path, init);
    const type = r.headers.get("content-type") ?? "";
    const body = type.includes("json") ? await r.json() : await r.arrayBuffer();
    const result = test(r, body);
    const ms = Date.now() - t0;
    if (result === true) console.log(`✓ ${name.padEnd(34)} ${r.status} ${ms}ms`);
    else {
      failed++;
      console.log(`✗ ${name.padEnd(34)} ${r.status} ${ms}ms — ${result}`);
    }
  } catch (err: any) {
    failed++;
    console.log(`✗ ${name.padEnd(34)} — ${err.message} (is the server running on ${BASE}?)`);
  }
}
const json = { "Content-Type": "application/json" };

await check("GET /health", "/health", (r, b) => (r.ok && b.ok ? (b.mistral_key_set ? true : "MISTRAL_API_KEY not set") : "not ok"));
await check("GET /cases (ready only)", "/cases", (r, b) => (r.ok && b.some((c: any) => c.id === id) ? true : `${id} missing from the list`));
await check(`GET /cases/${id}`, `/cases/${id}`, (r, b) => (r.ok && b.breach?.people_affected ? true : "no people_affected"));
await check("GET /pitch (brief + markdown)", `/cases/${id}/pitch`, (r, b) =>
  !r.ok ? "error" : !b.brief ? "no brief" : !b.brief.value?.scenarios?.value ? "no scenarios (category missing?)" : !b.markdown ? "no markdown" : true
);
await check("GET /summary", `/cases/${id}/summary`, (r, b) => {
  if (!r.ok) return "error";
  const bad = b.citations.filter((c: any) => !c.verified).length;
  return b.markdown?.length > 500 ? (bad ? (console.log(`    (${bad}/${b.citations.length} citations unverified, shown with ⚠)`), true) : true) : "summary too short";
});
await check("GET /brief.pdf", `/cases/${id}/brief.pdf`, (r, b) => (r.ok && (r.headers.get("content-type") ?? "").includes("pdf") && b.byteLength > 10000 ? true : "not a PDF"));
await check("GET /pages/3", `/cases/${id}/pages/3`, (r, b) => (r.ok && b.text?.length > 100 ? true : "no page text"));
await check("GET /matches", `/cases/${id}/matches`, (r, b) => (r.ok && b.matches?.length ? true : "no matches"));
await check("GET /funders", "/funders", (r, b) => (r.ok && b.length ? true : "no funders"));
await check("GET /radar", "/radar?status=candidate&priority=high", (r, b) => (r.ok && b.items?.some((i: any) => i.case_id === id) ? true : `${id} not linked in radar`));
await check("GET /decisions/<id>.pdf", `/decisions/${id}.pdf`, (r) => (r.ok ? true : "decision PDF not served"));
await check("404 on unknown route", "/nope", (r, b) => (r.status === 404 && b.error ? true : "no JSON 404"));
await check("400 on bad JSON body", `/cases/${id}/chat`, (r, b) => (r.status === 400 && b.error ? true : "no JSON 400"), { method: "POST", headers: json, body: "{bad" });
await check("400 on locked brief field", `/cases/${id}/brief`, (r, b) => (r.status === 400 ? true : "decision field was editable!"), {
  method: "PATCH",
  headers: json,
  body: JSON.stringify({ edits: { "victims.number": 1 } }),
});
if (withChat)
  await check("POST /chat (live model call)", `/cases/${id}/chat`, (r, b) => (r.ok && b.answer ? true : b.error ?? "no answer"), {
    method: "POST",
    headers: json,
    body: JSON.stringify({ question: "Quel est le montant de l'amende ?" }),
  });

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
