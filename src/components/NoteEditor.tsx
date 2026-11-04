"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { SessionFacts } from "@/lib/note-draft";
import { checklist as runChecklist, templateDraft } from "@/lib/note-draft";
import { saveNote, signNote, cosignNote, returnNote } from "@/app/actions";
import { useRouter } from "next/navigation";

const CHECKS: { key: keyof ReturnType<typeof runChecklist>; label: string }[] = [
  { key: "time_units", label: "Start/stop time and units match the session timer" },
  { key: "pos_caregiver", label: "Place of service + caregiver presence recorded" },
  { key: "targets", label: "Each skill target run is named with its data" },
  { key: "behavior", label: "Each behavior target has data and the intervention" },
  { key: "response", label: "Response to treatment / medical necessity stated" },
];

export function NoteEditor({ sessionId, facts, client, existing, previous, quickNotes, canEdit, isBcba, noteId }: {
  sessionId: string; facts: SessionFacts; client: { name: string; payer: string };
  existing: { body: string; status: string; checklist: Record<string, boolean>; return_reason: string | null } | null;
  previous: string | null; quickNotes: string[]; canEdit: boolean; isBcba: boolean; noteId: string | null;
}) {
  const router = useRouter();
  const [body, setBody] = useState(existing?.body ?? "");
  const [caregiver, setCaregiver] = useState<boolean | null>(facts.caregiverPresent);
  const [busy, setBusy] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const locked = existing?.status === "signed" || existing?.status === "cosigned";
  const factsNow = useMemo(() => ({ ...facts, caregiverPresent: caregiver }), [facts, caregiver]);
  const checks = useMemo(() => runChecklist(factsNow, body), [factsNow, body]);
  const allPass = Object.values(checks).every(Boolean);
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  async function draft(withPrevious: boolean) {
    setBusy("draft"); setErr(null);
    try {
      const r = await fetch("/api/note/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts: factsNow, previous: withPrevious ? previous : undefined }) });
      const j = await r.json();
      let text: string = j.body;
      if (quickNotes.length) text += ` Technician notes: ${quickNotes.join("; ")}.`;
      setBody(text); setSource(j.source);
    } catch (e) { setBody(templateDraft(factsNow)); setSource("template"); void e; }
    setBusy(null);
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setErr(null);
    try { await fn(); router.refresh(); } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  }

  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-ground flex flex-col max-w-[560px] mx-auto">
      <header className="bg-white border-b border-line px-5 pt-5 pb-3 flex flex-col gap-2 sticky top-0 z-10">
        <div className="flex justify-between items-center">
          <Link href="/today" className="text-sm text-muted no-underline">‹ My day</Link>
          <div className="font-bold">Session note</div>
          <div className="w-12" />
        </div>
        <div className="flex justify-between items-center text-[13px] text-muted">
          <span>{client.name} · {facts.cpt} · {fmt(facts.startedAt)}–{fmt(facts.endedAt)} · {facts.units} units</span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${locked ? "bg-teal-soft text-teal" : existing?.status === "returned" ? "bg-red-soft text-red" : "bg-line-soft text-ink"}`}>{existing?.status ?? "draft"}</span>
        </div>
        {existing?.status === "returned" && existing.return_reason && <div className="text-xs text-red">Returned by BCBA: {existing.return_reason}</div>}
      </header>

      <div className="grow p-4 flex flex-col gap-3">
        <section className="bg-white border border-line rounded-2xl p-3.5 flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider">Filled from the session</div>
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <div><div className="text-muted">Time in / out</div><div className="font-semibold">{fmt(facts.startedAt)} – {fmt(facts.endedAt)} · {facts.minutes} min</div></div>
            <div><div className="text-muted">Place of service</div><div className="font-semibold">{facts.pos}</div></div>
            <div><div className="text-muted">Rendering provider</div><div className="font-semibold">{facts.staffName}, {facts.staffCredential}</div></div>
            <div>
              <div className="text-muted">Caregiver present</div>
              {locked ? <div className="font-semibold">{caregiver === null ? "—" : caregiver ? "Yes" : "No"}</div> : (
                <div className="flex gap-1.5 mt-0.5">
                  {[true, false].map((v) => (
                    <button key={String(v)} onClick={() => setCaregiver(v)} className={`min-h-8 px-3 rounded-full border text-xs font-semibold ${caregiver === v ? "border-teal bg-teal-soft text-teal" : "border-[#cdd2da] bg-white"}`}>{v ? "Yes" : "No"}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="text-[13px] text-muted leading-relaxed">
            {facts.targets.map((t) => <span key={t.name}><b className="text-ink">{t.program}</b>: {t.summary}. </span>)}
          </div>
        </section>

        <section className="bg-white border border-line rounded-2xl p-3.5 flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider">Narrative</div>
            <div className={`text-xs ${words && words < 120 ? "text-amber-ink" : "text-muted"}`}>{words} words{source ? ` · ${source === "model" ? "AI draft" : "template draft"}` : ""}</div>
          </div>
          {!locked && canEdit && (
            <div className="grid grid-cols-2 gap-2">
              <button disabled={!previous || busy !== null} onClick={() => draft(true)} className="min-h-12 rounded-xl border border-[#cdd2da] bg-white text-[13px] font-semibold disabled:opacity-50">{previous ? "Copy last note's style + today's data" : "No previous note yet"}</button>
              <button disabled={busy !== null} onClick={() => draft(false)} className="min-h-12 rounded-xl bg-teal text-white text-[13px] font-bold disabled:opacity-50">{busy === "draft" ? "Drafting…" : body ? "Redraft from today's data" : "Draft from today's data"}</button>
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={locked || !canEdit}
            rows={10}
            className="w-full p-3 border border-line rounded-xl text-sm leading-relaxed bg-white read-only:bg-ground"
            placeholder="Draft from today's data, then edit anything in place. The draft only uses what was collected — it never invents what happened."
          />
        </section>

        <section className="bg-white border border-line rounded-2xl p-3.5 flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider">Payer requirements</div>
          {CHECKS.map((c) => (
            <div key={c.key} className="flex items-center gap-2.5 text-[13px]">
              <span className={`w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-white text-xs ${checks[c.key] ? "bg-teal" : "bg-[#cdd2da]"}`}>✓</span>
              <span className={checks[c.key] ? "text-ink" : "text-muted"}>{c.label}</span>
            </div>
          ))}
        </section>
        {err && <div className="text-sm text-red">{err}</div>}
      </div>

      <footer className="sticky bottom-0 bg-white border-t border-line p-4 pb-7 flex flex-col gap-2">
        {!locked && canEdit && (
          <div className="flex gap-2">
            <button disabled={busy !== null} onClick={() => run("save", () => saveNote(sessionId, body, checks, caregiver))} className="min-h-[52px] px-4 rounded-[14px] border border-[#cdd2da] bg-white text-sm font-semibold">Save draft</button>
            <button disabled={!allPass || busy !== null} onClick={() => run("sign", () => signNote(sessionId, body, checks, caregiver))} className={`grow min-h-[52px] rounded-[14px] text-white text-[15px] font-bold ${allPass ? "bg-ink" : "bg-[#9aa3b2]"}`}>
              {allPass ? "Sign and submit for co-sign" : `Complete ${Object.values(checks).filter((v) => !v).length} requirement(s) to sign`}
            </button>
          </div>
        )}
        {existing?.status === "signed" && isBcba && noteId && (
          <div className="flex gap-2">
            <button disabled={busy !== null} onClick={() => { const r = window.prompt("What needs to change?"); if (r) run("return", () => returnNote(noteId, r)); }} className="min-h-[52px] px-4 rounded-[14px] border border-[#cdd2da] bg-white text-sm font-semibold">Send back</button>
            <button disabled={busy !== null} onClick={() => run("cosign", () => cosignNote(noteId))} className="grow min-h-[52px] rounded-[14px] bg-teal text-white text-[15px] font-bold">Co-sign · creates claim line</button>
          </div>
        )}
        {existing?.status === "cosigned" && <div className="text-center text-sm text-teal font-semibold">Co-signed · claim line {facts.cpt} × {facts.units} units created</div>}
        <div className="text-xs text-muted text-center">Signed notes are locked. Co-signing generates the claim line automatically.</div>
      </footer>
    </div>
  );
}
