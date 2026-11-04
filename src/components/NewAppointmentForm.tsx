"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAppointments } from "@/app/actions";
import { Field, inputCls, Btn } from "./ui";
import { CPT_LABEL } from "@/lib/types";

export function NewAppointmentForm({ clients, staff, onDone }: { clients: { id: string; name: string }[]; staff: { id: string; name: string; role: string }[]; onDone?: () => void }) {
  const router = useRouter();
  const today = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  const [f, setF] = useState({ client_id: clients[0]?.id ?? "", staff_id: staff[0]?.id ?? "", cpt_code: "97153", date: `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`, start: "15:00", end: "17:00", place_of_service: "12", repeat_weeks: "1" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="flex flex-col gap-3">
      <Field label="Client"><select className={inputCls} value={f.client_id} onChange={(e) => set("client_id", e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Staff"><select className={inputCls} value={f.staff_id} onChange={(e) => set("staff_id", e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}</select></Field>
      <Field label="Service"><select className={inputCls} value={f.cpt_code} onChange={(e) => set("cpt_code", e.target.value)}>{["97153", "97155", "97156", "97151"].map((c) => <option key={c} value={c}>{c} · {CPT_LABEL[c]}</option>)}</select></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Date"><input type="date" className={inputCls} value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Start"><input type="time" className={inputCls} value={f.start} onChange={(e) => set("start", e.target.value)} /></Field>
        <Field label="End"><input type="time" className={inputCls} value={f.end} onChange={(e) => set("end", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Place"><select className={inputCls} value={f.place_of_service} onChange={(e) => set("place_of_service", e.target.value)}><option value="12">Home</option><option value="11">Clinic</option><option value="03">School</option><option value="10">Telehealth</option></select></Field>
        <Field label="Repeat weekly" hint="1 = just this one"><input type="number" min={1} max={26} className={inputCls} value={f.repeat_weeks} onChange={(e) => set("repeat_weeks", e.target.value)} /></Field>
      </div>
      {err && <div className="text-sm text-red">{err}</div>}
      <Btn disabled={busy || !f.client_id || !f.staff_id} onClick={async () => { setBusy(true); setErr(null); try { await createAppointments(f); router.refresh(); onDone?.(); } catch (e) { setErr((e as Error).message); } setBusy(false); }}>{busy ? "Saving…" : Number(f.repeat_weeks) > 1 ? `Add ${f.repeat_weeks} appointments` : "Add appointment"}</Btn>
    </div>
  );
}
