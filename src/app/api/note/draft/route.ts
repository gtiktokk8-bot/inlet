import { NextResponse } from "next/server";
import { templateDraft, type SessionFacts } from "@/lib/note-draft";

// Drafts a note from structured session facts. If ANTHROPIC_API_KEY is set, the model is asked to
// write ONLY from the facts given (plus an optional previous note for style). Without a key, the
// deterministic template is returned. Never send real PHI to a vendor without a signed BAA.
export async function POST(req: Request) {
  const { facts, previous } = (await req.json()) as { facts: SessionFacts; previous?: string };
  const template = templateDraft(facts);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ body: template, source: "template" });

  const system = `You write ABA session notes for insurance review. Rules: use ONLY the facts provided; never invent events, numbers, behaviors or interventions; keep every number exactly as given; write in third person, past tense, clinical but plain; include start/end time, units, place of service, caregiver presence, each target run with its data, each behavior with the intervention, and a medical-necessity/continue-services sentence. Do NOT write a response-to-treatment section or a caregiver update — the clinician fills those in separately. If a fact is missing, leave it out rather than inventing it. 180-260 words. No headings, one paragraph.`;
  const user = `FACTS (JSON):\n${JSON.stringify(facts, null, 2)}\n\n${previous ? `PREVIOUS NOTE FOR STYLE ONLY (do not copy its data):\n${previous}\n\n` : ""}Write the note.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 700, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) throw new Error(`model ${r.status}`);
    const j = (await r.json()) as { content: { type: string; text?: string }[] };
    const text = j.content.map((c) => c.text ?? "").join("").trim();
    return NextResponse.json({ body: text || template, source: text ? "model" : "template" });
  } catch {
    return NextResponse.json({ body: template, source: "template" });
  }
}
