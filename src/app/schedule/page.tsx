import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { authUsage } from "@/lib/queries";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Pill, fmtTime } from "@/components/ui";
import { unitsFromMinutes } from "@/lib/clinical";

export default async function Schedule() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const [{ data: appts }, auths, { data: staff }] = await Promise.all([
    supabase.from("appointments").select("*, clients(first_name, last_name), profiles(full_name, cert_expires_on), sessions(id, status, notes(status))").gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at"),
    authUsage(supabase),
    supabase.from("profiles").select("id, full_name, credential, cert_expires_on"),
  ]);
  type A = { id: string; client_id: string; staff_id: string; cpt_code: string; starts_at: string; ends_at: string; place_of_service: string; clients: { first_name: string; last_name: string } | null; profiles: { full_name: string; cert_expires_on: string | null } | null; sessions: { id: string; status: string; notes: { status: string }[] }[] };
  const list = (appts ?? []) as A[];

  // Auth check: scheduled-but-unbilled units + used units vs authorized
  const planned = new Map<string, number>();
  for (const a of list) {
    const k = `${a.client_id}:${a.cpt_code}`;
    planned.set(k, (planned.get(k) ?? 0) + unitsFromMinutes((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000));
  }
  const warnings: string[] = [];
  for (const au of auths) {
    const p = planned.get(`${au.client_id}:${au.cpt_code}`) ?? 0;
    if (au.units_used + p > au.units_authorized) warnings.push(`${au.cpt_code} for client ${au.client_id.slice(-4)} would exceed authorization (${au.units_used} used + ${p} planned > ${au.units_authorized}).`);
    if (au.days_left <= 30) warnings.push(`${au.cpt_code} authorization ends in ${au.days_left} days — reauthorization needed.`);
  }
  for (const s of (staff ?? []) as { full_name: string; credential: string | null; cert_expires_on: string | null }[]) {
    if (s.cert_expires_on) {
      const d = Math.round((Date.parse(s.cert_expires_on) - Date.now()) / 86400e3);
      if (d <= 45) warnings.push(`${s.full_name} · ${s.credential} renews in ${d} days — sessions after that date will be flagged.`);
    }
  }

  const days = [0, 1, 2, 3, 4].map((i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const units = list.reduce((s, a) => s + unitsFromMinutes((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000), 0);

  return (
    <Shell profile={profile} active="/schedule">
      <PageTitle title={`Week of ${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`} sub={`${list.length} sessions · ${units} billable units planned`} />
      {warnings.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {warnings.map((w, i) => <div key={i} className="px-3.5 py-3 rounded-xl bg-amber-soft border border-[#f3d9b1] text-[13px]">{w}</div>)}
        </div>
      )}
      <Card className="overflow-x-auto">
        <div className="min-w-[860px] grid grid-cols-5">
          {days.map((d) => {
            const todays = list.filter((a) => new Date(a.starts_at).toDateString() === d.toDateString());
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div key={d.toISOString()} className="border-l first:border-l-0 border-line-soft min-h-[420px]">
                <div className={`px-3 py-3 border-b border-line text-[13px] font-semibold ${isToday ? "text-teal" : ""}`}>{d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}{isToday ? " · today" : ""}</div>
                <div className="p-1.5 flex flex-col gap-1.5">
                  {todays.map((a) => {
                    const s = a.sessions?.[0];
                    const nraw = s?.notes as unknown; const note = (Array.isArray(nraw) ? nraw[0] : nraw) ? ((Array.isArray(nraw) ? nraw[0] : nraw) as { status: string }).status : undefined;
                    const tone = note === "cosigned" ? "bg-teal-soft border-l-teal" : s?.status === "in_progress" ? "bg-teal-soft border-l-teal border border-teal" : s && !note ? "bg-amber-soft border-l-amber" : a.cpt_code !== "97153" ? "bg-line-soft border-l-ink" : "bg-white border border-[#cdd2da] border-l-teal";
                    return (
                      <div key={a.id} className={`px-2.5 py-2 rounded-lg border-l-[3px] text-xs ${tone}`}>
                        <b>{a.clients?.first_name} {a.clients?.last_name}</b> · {a.profiles?.full_name}
                        <div className="text-muted">{a.cpt_code} · {fmtTime(a.starts_at)}–{fmtTime(a.ends_at)} · {a.place_of_service === "12" ? "Home" : "Clinic"}</div>
                        {s?.status === "in_progress" && <div className="text-teal font-semibold">In session</div>}
                        {s && s.status === "ended" && !note && <div className="text-amber-ink font-semibold">Note not started</div>}
                        {note && note !== "cosigned" && <div className="text-amber-ink font-semibold">Note {note}</div>}
                        {note === "cosigned" && <div className="text-teal font-semibold">Billed</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="text-xs text-muted flex gap-4 flex-wrap"><Pill tone="teal">Signed / billed</Pill><Pill tone="gray">Scheduled</Pill><Pill tone="amber">Note pending</Pill><span>Every completed block becomes a claim line once the note is co-signed.</span></div>
    </Shell>
  );
}
