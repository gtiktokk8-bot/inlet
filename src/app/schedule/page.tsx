import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { authUsage, listClients } from "@/lib/queries";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Pill, fmtTime, Empty } from "@/components/ui";
import { unitsFromMinutes } from "@/lib/clinical";
import { NewAppointmentForm } from "@/components/NewAppointmentForm";
import { CancelAppointment } from "@/components/CancelAppointment";

export default async function Schedule({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const { w } = await searchParams;
  const offset = Number(w ?? 0) || 0;
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const [{ data: appts }, auths, { data: staff }, clients] = await Promise.all([
    supabase.from("appointments").select("*, clients(first_name, last_name), profiles(full_name, cert_expires_on), sessions(id, status, notes(status))").neq("status", "cancelled").gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at"),
    authUsage(supabase),
    supabase.from("profiles").select("id, full_name, role, credential, cert_expires_on").order("full_name"),
    listClients(supabase),
  ]);
  type A = { id: string; client_id: string; staff_id: string; cpt_code: string; starts_at: string; ends_at: string; place_of_service: string; clients: { first_name: string; last_name: string } | null; profiles: { full_name: string; cert_expires_on: string | null } | null; sessions: { id: string; status: string; notes: unknown }[] };
  const list = (appts ?? []) as A[];
  const staffList = (staff ?? []) as { id: string; full_name: string; role: string; credential: string | null; cert_expires_on: string | null }[];
  const cname = (id: string) => { const c = clients.find((c) => c.id === id); return c ? `${c.first_name} ${c.last_name}` : "client"; };

  const planned = new Map<string, number>();
  for (const a of list) { const k = `${a.client_id}:${a.cpt_code}`; planned.set(k, (planned.get(k) ?? 0) + unitsFromMinutes((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000)); }
  const warnings: string[] = [];
  for (const au of auths) {
    const p = planned.get(`${au.client_id}:${au.cpt_code}`) ?? 0;
    if (au.days_left >= 0 && au.units_used + p > au.units_authorized) warnings.push(`${cname(au.client_id)} · ${au.cpt_code}: this week would exceed the authorization (${au.units_used} used + ${p} planned > ${au.units_authorized}).`);
    if (au.days_left >= 0 && au.days_left <= 30) warnings.push(`${cname(au.client_id)} · ${au.cpt_code} authorization ends in ${au.days_left} days.`);
  }
  for (const s of staffList) {
    if (s.cert_expires_on) { const d = Math.round((Date.parse(s.cert_expires_on) - Date.now()) / 86400e3); if (d <= 45) warnings.push(`${s.full_name} · ${s.credential} renews in ${d} days — sessions after that date get flagged.`); }
  }
  const days = [0, 1, 2, 3, 4, 5].map((i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const units = list.reduce((s, a) => s + unitsFromMinutes((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000), 0);
  const label = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[5].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <Shell profile={profile} active="/schedule">
      <PageTitle title={offset === 0 ? "This week" : offset === 1 ? "Next week" : `Week of ${label}`} sub={`${label} · ${list.length} sessions · ${units} billable units planned`}
        actions={<div className="flex gap-1"><a href={`/schedule?w=${offset - 1}`} className="min-h-10 px-3 inline-flex items-center rounded-[10px] border border-[#cfcdc6] bg-card text-sm font-semibold no-underline text-ink">‹</a><a href="/schedule" className="min-h-10 px-3 inline-flex items-center rounded-[10px] border border-[#cfcdc6] bg-card text-sm font-semibold no-underline text-ink">Today</a><a href={`/schedule?w=${offset + 1}`} className="min-h-10 px-3 inline-flex items-center rounded-[10px] border border-[#cfcdc6] bg-card text-sm font-semibold no-underline text-ink">›</a></div>} />
      {warnings.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {warnings.map((w, i) => <div key={i} className="px-3.5 py-3 rounded-xl bg-amber-soft border border-[#f0d9b0] text-[13px]">{w}</div>)}
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Card className="xl:col-span-3 overflow-x-auto">
          {list.length === 0 ? <Empty title="Nothing scheduled this week" body="Add an appointment on the right. Repeat weekly to build a standing schedule." /> : (
            <div className="min-w-[900px] grid grid-cols-6">
              {days.map((d) => {
                const todays = list.filter((a) => new Date(a.starts_at).toDateString() === d.toDateString());
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <div key={d.toISOString()} className="border-l first:border-l-0 border-line-soft min-h-[420px]">
                    <div className={`px-3 py-3 border-b border-line text-[13px] font-semibold ${isToday ? "text-teal-ink" : ""}`}>{d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}{isToday ? " · today" : ""}</div>
                    <div className="p-1.5 flex flex-col gap-1.5">
                      {todays.map((a) => {
                        const s = a.sessions?.[0];
                        const nraw = s?.notes as unknown; const n = Array.isArray(nraw) ? nraw[0] : nraw; const note = n ? (n as { status: string }).status : undefined;
                        const tone = note === "cosigned" ? "bg-teal-soft border-l-teal" : s?.status === "in_progress" ? "bg-teal-soft border-l-teal border border-teal" : s && !note ? "bg-amber-soft border-l-amber" : a.cpt_code !== "97153" ? "bg-line-soft border-l-ink" : "bg-card border border-[#cfcdc6] border-l-teal";
                        return (
                          <div key={a.id} className={`px-2.5 py-2 rounded-lg border-l-[3px] text-xs ${tone}`}>
                            <div className="flex justify-between gap-1"><b>{a.clients?.first_name} {a.clients?.last_name}</b>{!s && <CancelAppointment id={a.id} />}</div>
                            <div className="text-muted">{a.profiles?.full_name}</div>
                            <div className="text-muted">{a.cpt_code} · {fmtTime(a.starts_at)}–{fmtTime(a.ends_at)} · {a.place_of_service === "12" ? "Home" : a.place_of_service === "11" ? "Clinic" : a.place_of_service === "03" ? "School" : "Telehealth"}</div>
                            {s?.status === "in_progress" && <div className="text-teal-ink font-semibold">In session</div>}
                            {s && s.status === "ended" && !note && <div className="text-amber-ink font-semibold">Note not started</div>}
                            {note && note !== "cosigned" && <div className="text-amber-ink font-semibold">Note {note}</div>}
                            {note === "cosigned" && <div className="text-teal-ink font-semibold">Billed</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card className="p-4.5 h-fit">
          <div className="font-bold mb-3">Add appointment</div>
          <NewAppointmentForm clients={clients.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` }))} staff={staffList.map((s) => ({ id: s.id, name: s.full_name, role: s.credential ?? s.role }))} />
        </Card>
      </div>
      <div className="text-xs text-muted flex gap-4 flex-wrap"><Pill tone="teal">Signed / billed</Pill><Pill tone="gray">Scheduled</Pill><Pill tone="amber">Note pending</Pill><span>Every completed block becomes a claim line once the note is co-signed.</span></div>
    </Shell>
  );
}
