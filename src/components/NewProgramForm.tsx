"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GOAL_BANK } from "@/lib/goal-bank";
import { addProgram } from "@/app/actions";
import { Card } from "./ui";

const SOURCES = ["All", "VB-MAPP", "ABLLS-R", "AFLS", "PEAK", "EFL", "custom"];

export function NewProgramForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [src, setSrc] = useState("All");
  const [q, setQ] = useState("");
  const [f, setF] = useState({ name: "", domain: "", goal_text: "", source: "custom", target_name: "", data_type: "trial", sd: "", steps: "" });
  const [busy, setBusy] = useState(false);
  const bank = GOAL_BANK.filter((g) => (src === "All" || g.source === src) && (!q || `${g.name} ${g.goal} ${g.domain}`.toLowerCase().includes(q.toLowerCase())));
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {SOURCES.map((s) => <button key={s} onClick={() => setSrc(s)} className={`min-h-8 px-2.5 rounded-full border text-xs font-semibold ${src === s ? "border-teal bg-teal-soft text-teal-ink" : "border-[#cfcdc6] bg-card"}`}>{s}</button>)}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search goals…" className="min-h-10 px-3 border border-[#cfcdc6] rounded-[10px] text-sm" />
        <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto">
          {bank.map((g, i) => (
            <button key={i} onClick={() => setF({ name: g.name, domain: g.domain, goal_text: g.goal, source: g.source, target_name: g.name, data_type: g.data_type, sd: g.sd ?? "", steps: (g.steps ?? []).join("\n") })} className="text-left p-3 border border-line rounded-xl hover:border-teal">
              <div className="text-xs text-muted font-semibold">{g.source} · {g.domain}</div>
              <div className="text-sm font-semibold">{g.name}</div>
              <div className="text-[13px] text-muted leading-snug">{g.goal}</div>
              <div className="text-xs text-muted mt-1">Suggested: {g.data_type.replace("_", " ")}</div>
            </button>
          ))}
        </div>
      </Card>
      <Card className="p-4 flex flex-col gap-3">
        <label className="text-sm flex flex-col gap-1">Program name<input value={f.name} onChange={(e) => set("name", e.target.value)} className="min-h-10 px-3 border border-[#cfcdc6] rounded-[10px]" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm flex flex-col gap-1">Domain<input value={f.domain} onChange={(e) => set("domain", e.target.value)} className="min-h-10 px-3 border border-[#cfcdc6] rounded-[10px]" /></label>
          <label className="text-sm flex flex-col gap-1">Source<input value={f.source} onChange={(e) => set("source", e.target.value)} className="min-h-10 px-3 border border-[#cfcdc6] rounded-[10px]" /></label>
        </div>
        <label className="text-sm flex flex-col gap-1">Goal (individualize this)<textarea value={f.goal_text} onChange={(e) => set("goal_text", e.target.value)} rows={3} className="p-3 border border-[#cfcdc6] rounded-[10px]" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm flex flex-col gap-1">First target<input value={f.target_name} onChange={(e) => set("target_name", e.target.value)} className="min-h-10 px-3 border border-[#cfcdc6] rounded-[10px]" /></label>
          <label className="text-sm flex flex-col gap-1">Data type
            <select value={f.data_type} onChange={(e) => set("data_type", e.target.value)} className="min-h-10 px-3 border border-[#cfcdc6] rounded-[10px] bg-card">
              <option value="trial">Trial % (with prompt levels)</option><option value="frequency">Frequency</option><option value="duration">Duration</option><option value="task_analysis">Task analysis</option>
            </select>
          </label>
        </div>
        {f.data_type === "trial" && <label className="text-sm flex flex-col gap-1">SD / instruction<input value={f.sd} onChange={(e) => set("sd", e.target.value)} className="min-h-10 px-3 border border-[#cfcdc6] rounded-[10px]" /></label>}
        {f.data_type === "task_analysis" && <label className="text-sm flex flex-col gap-1">Steps (one per line)<textarea value={f.steps} onChange={(e) => set("steps", e.target.value)} rows={5} className="p-3 border border-[#cfcdc6] rounded-[10px]" /></label>}
        <div className="text-xs text-muted">Mastery defaults to 80% across 3 sessions with at least 5 trials; edit per target later.</div>
        <button disabled={!f.name || !f.goal_text || busy} onClick={async () => { setBusy(true); await addProgram(clientId, f); router.push(`/clients/${clientId}`); }} className="min-h-11 rounded-xl bg-ink text-white font-semibold disabled:opacity-50">{busy ? "Saving…" : "Add program + target"}</button>
      </Card>
    </div>
  );
}
