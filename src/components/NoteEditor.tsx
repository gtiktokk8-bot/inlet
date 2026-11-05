"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { SessionFacts } from "@/lib/note-draft";
import { checklist as runChecklist, templateDraft } from "@/lib/note-draft";
import { saveNote, signNote, cosignNote, returnNote, updateSessionTimes } from "@/app/actions";
import { splitNote, joinNote, stripPlaceholders } from "@/lib/note-draft";
import { useRouter } from "next/navigation";
import { hoursLeft } from "./ui";

type Checks = ReturnType<typeof runChecklist>;

function reasons(f: SessionFacts, c: Checks): Record<keyof Checks, { label: string; why: string }> {
  const ran = f.targets.filter((t) => t.summary !== "not run this session");
  const skills = ran.filter((t) => t.dataType === "trial" || t.dataType === "task_analysis");
  const behaviors = ran.filter((t) => t.dataType === "frequency" || t.dataType === "duration");
  return {
    time_units: {
      label: `Billable time: ${f.minutes} min = ${f.units} unit${f.units === 1 ? "" : "s"}`,
      why: c.time_units ? "15-minute units, 8-minute minimum." : f.minutes < 8 ? "Under the 8-minute minimum — 0 units. If the timer is wrong, fix the times above." : "Units could not be computed.",
    },
    pos_caregiver: { label: "Caregiver presence + caregiver update", why: c.pos_caregiver ? `${f.pos} · caregiver ${f.caregiverPresent ? "present" : "not present"} · update noted` : f.caregiverPresent === null ? "Pick Yes or No for caregiver present." : "Fill in the caregiver update at the top (or tap “None reported”)." },
    targets: { label: `Skill targets named with data (${skills.length})`, why: c.targets ? skills.map((t) => t.program).join(", ") || "none run" : "Every skill program run today must appear in the narrative by name." },
    behavior: { label: `Behavior targets with intervention (${behaviors.length})`, why: c.behavior ? behaviors.map((t) => t.program).join(", ") || "none run" : "Every behavior program with data must appear by name, with what was done." },
    response: { label: "Response to treatment", why: c.response ? "Stated." : "Write how the client responded to treatment today in the Response to treatment box." },
  };
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function NoteEditor({ sessionId, facts, client, existing, previous, quickNotes, canEdit, isBcba, noteId }: {
  sessionId: string; facts: SessionFacts; client: { name: string; payer: string };
  existing: { body: string; status: string; checklist: Record<string, boolean>; return_reason: string | null } | null;
  previous: string | null; quickNotes: string[]; canEdit: boolean; isBcba: boolean; noteId: string | null;
}) {
  const router = useRouter();
  const [sec, setSec] = useState(() => splitNote(existing?.body ?? ""));
  const setPart = (k: "caregiver" | "session" | "response", v: string) => setSec((x) => ({ ...x, [k]: v }));
  const body = useMemo(() => (sec.caregiver || sec.session || sec.response ? joinNote(sec) : ""), [sec]);
  const [caregiver, setCaregiver] = useState<boolean | null>(facts.caregiverPresent);
  const [busy, setBusy] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editTimes, setEditTimes] = useState(false);
  const [tStart, setTStart] = useState(toLocalInput(facts.startedAt));
  const [tEnd, setTEnd] = useState(toLocalInput(facts.endedAt));
  const locked = existing?.status === "signed" || existing?.status === "cosigned";
  const factsNow = useMemo(() => ({ ...facts, caregiverPresent: caregiver }), [facts, caregiver]);
  const checks = useMemo(() => runChecklist(factsNow, body), [factsNow, body]);
  const why = useMemo(() => reasons(factsNow, checks), [factsNow, checks]);
  const passCount = Object.values(checks).filter(Boolean).length;
  const allPass = passCount === 5;
  const words = sec.session.trim() ? sec.session.trim().split(/\s+/).length : 0;
  const due = new Date(Date.parse(facts.endedAt) + 48 * 3600e3).toISOString();
  const dueText = hoursLeft(due);

  async function draft(withPrevious: boolean) {
    setBusy("draft"); setErr(null);
    try {
      const r = await fetch("/api/note/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts: factsNow, previous: withPrevious ? previous : undefined }) });
      const j = await r.json();
      let text: string = stripPlaceholders(j.body);
      if (quickNotes.length) text += ` Technician notes: ${quickNotes.join("; ")}.`;
      setPart("session", text); setSource(j.source);
    } catch (e) { setPart("session", stripPlaceholders(templateDraft(factsNow))); setSource("template"); void e; }
    setBusy(null);
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setErr(null);
    try { await fn(); router.refresh(); } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  }

  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const order: (keyof Checks)[] = ["time_units", "pos_caregiver", "targets", "behavior", "response"];

  return (
    <div className="min-h-screen bg-ground flex flex-col max-w-[560px] mx-auto">
      <header className="bg-card border-b border-line px-5 pt-5 pb-3 flex flex-col gap-2 sticky top-0 z-10">
        <div className="flex justify-between items-center">
          <Link href="/today" className="text-sm text-muted no-underline">‹ My day</Link>
          <div className="font-bold">Session note</div>
          <div className="w-12" />
        </div>
        <div className="flex justify-between items-center text-[13px] text-muted gap-2">
          <span className="truncate">{client.name} · {facts.cpt} · {fmt(facts.startedAt)}–{fmt(facts.endedAt)}</span>
          <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${locked ? "bg-teal-soft text-teal-ink" : existing?.status === "returned" ? "bg-red-soft text-red" : dueText.startsWith("overdue") ? "bg-red-soft text-red" : "bg-gold-soft text-gold-ink"}`}>
            {locked ? existing?.status : existing?.status === "returned" ? "returned" : `due · ${dueText}`}
          </span>
        </div>
        {existing?.status === "returned" && existing.return_reason && <div className="text-xs text-red">Returned by BCBA: {existing.return_reason}</div>}
        {!locked && (
          <div className="bar h-1.5 rounded-full bg-line-soft overflow-hidden"><span className={`block h-full ${allPass ? "bg-teal" : "bg-gold"}`} style={{ width: `${(passCount / 5) * 100}%` }} /></div>
        )}
      </header>

      <div className="grow p-4 flex flex-col gap-3">
        <section className="bg-card border border-line rounded-2xl p-3.5 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider">Filled from the session</div>
            {!locked && canEdit && <button onClick={() => setEditTimes((v) => !v)} className="text-xs font-semibold text-teal-ink">{editTimes ? "Cancel" : "Fix times"}</button>}
          </div>
          {editTimes ? (
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-ground">
              <div className="text-xs text-muted">Use this when the timer was started late or the phone died. The change is recorded in the audit log.</div>
              <label className="text-xs font-medium flex flex-col gap-1">Start<input type="datetime-local" value={tStart} onChange={(e) => setTStart(e.target.value)} className="min-h-10 px-2 border border-[#cfcdc6] rounded-lg bg-card" /></label>
              <label className="text-xs font-medium flex flex-col gap-1">End<input type="datetime-local" value={tEnd} onChange={(e) => setTEnd(e.target.value)} className="min-h-10 px-2 border border-[#cfcdc6] rounded-lg bg-card" /></label>
              <button disabled={busy !== null} onClick={() => run("times", async () => { await updateSessionTimes(sessionId, new Date(tStart).toISOString(), new Date(tEnd).toISOString()); setEditTimes(false); })} className="min-h-10 rounded-lg bg-ink text-white text-sm font-semibold">Save times</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div><div className="text-muted">Time in / out</div><div className="font-semibold">{fmt(facts.startedAt)} – {fmt(facts.endedAt)} · {facts.minutes} min</div></div>
              <div><div className="text-muted">Place of service</div><div className="font-semibold">{facts.pos}</div></div>
              <div><div className="text-muted">Rendering provider</div><div className="font-semibold">{facts.staffName}, {facts.staffCredential}</div></div>
              <div>
                <div className="text-muted">Caregiver present</div>
                {locked ? <div className="font-semibold">{caregiver === null ? "—" : caregiver ? "Yes" : "No"}</div> : (
                  <div className="flex gap-1.5 mt-0.5">
                    {[true, false].map((v) => (
                      <button key={String(v)} onClick={() => setCaregiver(v)} className={`min-h-8 px-3 rounded-full border text-xs font-semibold ${caregiver === v ? "border-teal bg-teal-soft text-teal-ink" : "border-[#cfcdc6] bg-card"}`}>{v ? "Yes" : "No"}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="text-[13px] text-muted leading-relaxed">
            {facts.targets.map((t) => <span key={t.name}><b className="text-ink">{t.program}</b>: {t.summary}. </span>)}
          </div>
        </section>

        <section className="bg-card border border-line rounded-2xl p-3.5 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider">1 · Caregiver update</div>
            {!locked && canEdit && !sec.caregiver && <button onClick={() => setPart("caregiver", "None reported.")} className="text-xs font-semibold text-teal-ink">None reported</button>}
          </div>
          <textarea value={sec.caregiver} onChange={(e) => setPart("caregiver", e.target.value)} readOnly={locked || !canEdit} rows={3}
            className="w-full p-3 border border-line rounded-xl text-sm leading-relaxed bg-card read-only:bg-ground"
            placeholder="Anything the caregiver reported from today or the day before — sleep, illness, medication changes, events at home or school, behaviors they saw." />
        </section>

        <section className="bg-card border border-line rounded-2xl p-3.5 flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider">2 · Session</div>
            <div className={`text-xs ${words && words < 120 ? "text-amber-ink" : "text-muted"}`}>{words} words{source ? ` · ${source === "model" ? "AI draft" : "drafted from data"}` : ""}</div>
          </div>
          {!locked && canEdit && (
            <div className="grid grid-cols-2 gap-2">
              <button disabled={!previous || busy !== null} onClick={() => draft(true)} className="min-h-12 rounded-xl border border-[#cfcdc6] bg-card text-[13px] font-semibold disabled:opacity-50">{previous ? "Last note's style + today's data" : "No previous note yet"}</button>
              <button disabled={busy !== null} onClick={() => draft(false)} className="min-h-12 rounded-xl bg-teal text-white text-[13px] font-bold disabled:opacity-50">{busy === "draft" ? "Drafting…" : sec.session ? "Redraft from today's data" : "Draft from today's data"}</button>
            </div>
          )}
          <textarea value={sec.session} onChange={(e) => setPart("session", e.target.value)} readOnly={locked || !canEdit} rows={9}
            className="w-full p-3 border border-line rounded-xl text-sm leading-relaxed bg-card read-only:bg-ground"
            placeholder="Draft from today's data, then edit anything in place. The draft only uses what was collected — it never invents what happened." />
        </section>

        <section className="bg-card border border-line rounded-2xl p-3.5 flex flex-col gap-2">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider">3 · Response to treatment</div>
          <textarea value={sec.response} onChange={(e) => setPart("response", e.target.value)} readOnly={locked || !canEdit} rows={4}
            className="w-full p-3 border border-line rounded-xl text-sm leading-relaxed bg-card read-only:bg-ground"
            placeholder="How did the client respond to treatment today? Engagement, progress or regression vs. recent sessions, what helped, and any protocol changes to recommend to the BCBA." />
        </section>

        <section className="bg-card border border-line rounded-2xl p-3.5 flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider">Payer requirements</div>
            <div className="text-xs text-muted tabular-nums">{passCount}/5</div>
          </div>
          {order.map((k) => (
            <div key={k} className="flex items-start gap-2.5 text-[13px]">
              <span className={`mt-0.5 w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-white text-xs ${checks[k] ? "bg-teal pop" : "bg-[#cfcdc6]"}`}>✓</span>
              <div>
                <div className={checks[k] ? "text-ink font-medium" : "text-ink font-medium"}>{why[k].label}</div>
                <div className={`text-xs ${checks[k] ? "text-muted" : "text-amber-ink"}`}>{why[k].why}</div>
              </div>
            </div>
          ))}
        </section>
        {err && <div className="text-sm text-red">{err}</div>}
      </div>

      <footer className="sticky bottom-0 bg-card border-t border-line p-4 pb-7 flex flex-col gap-2">
        {!locked && canEdit && (
          <div className="flex gap-2">
            <button disabled={busy !== null} onClick={() => run("save", () => saveNote(sessionId, body, checks, caregiver))} className="min-h-[52px] px-4 rounded-[14px] border border-[#cfcdc6] bg-card text-sm font-semibold">{busy === "save" ? "Saving…" : "Save draft"}</button>
            <button disabled={!allPass || busy !== null} onClick={() => run("sign", () => signNote(sessionId, body, checks, caregiver))} className={`grow min-h-[52px] rounded-[14px] text-white text-[15px] font-bold ${allPass ? "bg-ink" : "bg-[#a7adb5]"}`}>
              {allPass ? "Sign and send for co-sign" : `${5 - passCount} to go before signing`}
            </button>
          </div>
        )}
        {existing?.status === "signed" && isBcba && noteId && (
          <div className="flex gap-2">
            <button disabled={busy !== null} onClick={() => { const r = window.prompt("What needs to change?"); if (r) run("return", () => returnNote(noteId, r)); }} className="min-h-[52px] px-4 rounded-[14px] border border-[#cfcdc6] bg-card text-sm font-semibold">Send back</button>
            <button disabled={busy !== null} onClick={() => run("cosign", () => cosignNote(noteId))} className="grow min-h-[52px] rounded-[14px] bg-teal text-white text-[15px] font-bold">Co-sign · creates claim line</button>
          </div>
        )}
        {existing?.status === "cosigned" && <div className="text-center text-sm text-teal-ink font-semibold">Co-signed · claim line {facts.cpt} × {facts.units} units created</div>}
        {!locked && <div className="text-xs text-muted text-center">Drafts save anytime. Signing locks the note; co-signing generates the claim line.</div>}
      </footer>
    </div>
  );
}
