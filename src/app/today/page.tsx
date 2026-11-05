import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Pill, fmtTime, fmtDate } from "@/components/ui";
import { StartSession } from "@/components/StartSession";
import { CPT_LABEL, POS_LABEL } from "@/lib/types";
import Link from "next/link";

export default async function Today() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const [{ data: appts }, { data: open }, { data: unsigned }] = await Promise.all([
    supabase.from("appointments").select("*, clients(first_name, last_name), sessions(id, status)").eq("staff_id", profile.id).gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at"),
    supabase.from("sessions").select("id, started_at, cpt_code, clients(first_name, last_name)").eq("staff_id", profile.id).eq("status", "in_progress"),
    supabase.from("sessions").select("id, started_at, cpt_code, clients(first_name, last_name), notes(status)").eq("staff_id", profile.id).eq("status", "ended").order("started_at", { ascending: false }).limit(10),
  ]);
  type Appt = { id: string; client_id: string; cpt_code: string; starts_at: string; ends_at: string; place_of_service: string; clients: { first_name: string; last_name: string } | null; sessions: { id: string; status: string }[] };
  type Sess = { id: string; started_at: string; cpt_code: string; clients: { first_name: string; last_name: string } | null; notes?: { status: string }[] | null };
  const list = (appts ?? []) as Appt[];
  const noteOf = (s: Sess) => (Array.isArray(s.notes) ? s.notes[0] : (s.notes as unknown as { status: string } | null));
  const needNote = ((unsigned ?? []) as unknown as Sess[]).filter((s) => { const n = noteOf(s); return !n || n.status === "draft" || n.status === "returned"; });

  return (
    <Shell profile={profile} active="/today">
      <PageTitle title="My day" sub={`${list.filter((a) => fmtDate(a.starts_at) === fmtDate(new Date().toISOString())).length} sessions today · ${needNote.length} notes to finish`} />

      {(open ?? []).length > 0 && (
        <Card className="p-4 border-teal">
          <div className="text-xs font-semibold text-teal-ink mb-2">IN PROGRESS</div>
          {((open ?? []) as unknown as Sess[]).map((s) => (
            <Link key={s.id} href={`/session/${s.id}`} className="flex justify-between items-center py-2 px-2 -mx-2 rounded-lg no-underline text-ink pressable">
              <div><b>{s.clients?.first_name} {s.clients?.last_name}</b> · {s.cpt_code} · started {fmtTime(s.started_at)}</div>
              <span className="font-semibold text-teal-ink">Resume →</span>
            </Link>
          ))}
        </Card>
      )}

      {needNote.length > 0 && (
        <Card className="p-4">
          <div className="text-xs font-semibold text-amber-ink mb-2">NOTES TO FINISH</div>
          {needNote.map((s) => (
            <Link key={s.id} href={`/session/${s.id}/note`} className="flex justify-between items-center py-2 px-2 -mx-2 rounded-lg border-b border-line-soft last:border-0 no-underline text-ink pressable">
              <div><b>{s.clients?.first_name} {s.clients?.last_name}</b> · {s.cpt_code} · {fmtDate(s.started_at)} {fmtTime(s.started_at)}</div>
              <Pill tone="amber">{noteOf(s)?.status === "returned" ? "Returned by BCBA" : "Draft"}</Pill>
            </Link>
          ))}
        </Card>
      )}

      <Card>
        <div className="px-4.5 py-3.5 border-b border-line font-bold">Next 7 days</div>
        {list.length === 0 && <div className="p-6 text-sm text-muted">Nothing scheduled in the next 7 days. Your BCBA adds appointments from the Schedule page.</div>}
        {list.map((a) => {
          const started = a.sessions?.[0];
          return (
            <div key={a.id} className="flex flex-wrap justify-between items-center gap-3 px-4.5 py-3.5 border-b border-line-soft last:border-0">
              <div>
                <div className="font-semibold">{a.clients?.first_name} {a.clients?.last_name} <span className="text-muted font-normal">· {fmtDate(a.starts_at)} {fmtTime(a.starts_at)}–{fmtTime(a.ends_at)}</span></div>
                <div className="text-xs text-muted">{a.cpt_code} {CPT_LABEL[a.cpt_code]} · {POS_LABEL[a.place_of_service]}</div>
              </div>
              {started ? (
                <Link href={started.status === "in_progress" ? `/session/${started.id}` : `/session/${started.id}/note`} className="text-sm font-semibold text-teal-ink no-underline">{started.status === "in_progress" ? "Resume" : "Open note"} →</Link>
              ) : (
                <StartSession appointment={{ id: a.id, client_id: a.client_id, cpt_code: a.cpt_code, place_of_service: a.place_of_service }} orgId={profile.org_id} staffId={profile.id} />
              )}
            </div>
          );
        })}
      </Card>
    </Shell>
  );
}
