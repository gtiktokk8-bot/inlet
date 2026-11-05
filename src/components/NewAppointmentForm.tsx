"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAppointments, updateAppointment } from "@/app/actions";
import { Field, inputCls, Btn } from "./ui";
import { CPT_LABEL } from "@/lib/types";

export type ApptFormValues = { client_id: string; staff_id: string; cpt_code: string; date: string; start: string; end: string; place_of_service: string; repeat_weeks: string };

const p = (n: number) => String(n).padStart(2, "0");
export const localDate = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
export const localTime = (d: Date) => `${p(d.getHours())}:${p(d.getMinutes())}`;

/** Create (no `appointmentId`) or edit (with `appointmentId`) an appointment. */
export function NewAppointmentForm({ clients, staff, onDone, initial, appointmentId }: {
  clients: { id: string; name: string }[]; staff: { id: string; name: string; role: string }[]; onDone?: () => void;
  initial?: Partial<ApptFormValues>; appointmentId?: string;
}) {
  const router = useRouter();
  const [f, setF] = useState<ApptFormValues>({ client_id: clients[0]?.id ?? "", staff_id: staff[0]?.id ?? "", cpt_code: "97153", date: localDate(new Date()), start: "15:00", end: "17:00", place_of_service: "12", repeat_weeks: "1", ...initial });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [saved, setSaved] = useState(false);
  const set = (k: keyof ApptFormValues, v: string) => { setSaved(false); setF((x) => ({ ...x, [k]: v })); };
  const editing = !!appointmentId;
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
        {!editing && <Field label="Repeat weekly" hint="1 = just this one"><input type="number" min={1} max={26} className={inputCls} value={f.repeat_weeks} onChange={(e) => set("repeat_weeks", e.target.value)} /></Field>}
      </div>
      {err && <div className="text-sm text-red">{err}</div>}
      {saved && <div className="text-sm text-teal-ink font-semibold pop">Saved</div>}
      <Btn disabled={busy || !f.client_id || !f.staff_id} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          const slots = [] as { starts_at: string; ends_at: string }[];
          const weeks = editing ? 1 : Math.max(1, Math.min(26, Number(f.repeat_weeks) || 1));
          for (let w = 0; w < weeks; w++) {
            const st = new Date(`${f.date}T${f.start}:00`); st.setDate(st.getDate() + w * 7);   // local time, in the user's zone
            const en = new Date(`${f.date}T${f.end}:00`); en.setDate(en.getDate() + w * 7);
            if (isNaN(st.getTime()) || isNaN(en.getTime())) throw new Error("pick a date and times");
            slots.push({ starts_at: st.toISOString(), ends_at: en.toISOString() });
          }
          if (editing) { await updateAppointment(appointmentId!, { client_id: f.client_id, staff_id: f.staff_id, cpt_code: f.cpt_code, place_of_service: f.place_of_service, ...slots[0] }); setSaved(true); }
          else { await createAppointments({ client_id: f.client_id, staff_id: f.staff_id, cpt_code: f.cpt_code, place_of_service: f.place_of_service, slots }); }
          router.refresh(); onDone?.();
        } catch (e) { setErr((e as Error).message); }
        setBusy(false);
      }}>{busy ? "Saving…" : editing ? "Save changes" : Number(f.repeat_weeks) > 1 ? `Add ${f.repeat_weeks} appointments` : "Add appointment"}</Btn>
    </div>
  );
}
