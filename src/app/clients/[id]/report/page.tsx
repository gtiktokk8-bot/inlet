import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { clientBook, targetHistory, authUsage } from "@/lib/queries";
import { sessionSeries, mastered } from "@/lib/clinical";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, fmtDate } from "@/components/ui";

export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const { id } = await params;
  const [{ client, programs }, auths] = await Promise.all([clientBook(supabase, id), authUsage(supabase)]);
  if (!client) redirect("/clients");
  const rows = await Promise.all(programs.flatMap((p) => p.targets.map(async (t) => {
    const { events, dates } = await targetHistory(supabase, t.id);
    const series = t.data_type === "trial" ? sessionSeries(events, dates) : [];
    const first = series[0], last = series.at(-1);
    return { program: p.name, goal: p.goal_text, target: t.name, type: t.data_type, sessions: new Set(events.map((e) => e.session_id)).size, first, last, mastered: t.data_type === "trial" && mastered(t, series) };
  })));
  const a = auths.filter((x) => x.client_id === id);
  return (
    <Shell profile={profile} active="/clients">
      <PageTitle title={`Progress report · ${client.first_name} ${client.last_name}`} sub={`Generated ${new Date().toLocaleDateString()} · every number below comes from session data, not from memory`} />
      <Card className="p-4.5 text-sm flex flex-col gap-2">
        <div><b>Authorization period:</b> {a.map((x) => `${x.cpt_code}: ${x.units_used}/${x.units_authorized} units used, ${fmtDate(x.starts_on)}–${fmtDate(x.ends_on)}`).join(" · ") || "private pay"}</div>
        <div><b>Diagnosis:</b> {client.diagnosis_code} · <b>DOB:</b> {client.dob}</div>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[720px]">
          <thead className="text-muted text-left"><tr>{["Program / goal", "Target", "Type", "Sessions", "First", "Latest", "Status"].map((h) => <th key={h} className="px-3.5 py-2.5 font-semibold border-b border-line">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line-soft last:border-0 align-top">
                <td className="px-3.5 py-2.5"><div className="font-semibold">{r.program}</div><div className="text-muted text-xs">{r.goal}</div></td>
                <td className="px-3.5 py-2.5">{r.target}</td>
                <td className="px-3.5 py-2.5">{r.type.replace("_", " ")}</td>
                <td className="px-3.5 py-2.5 tabular-nums">{r.sessions}</td>
                <td className="px-3.5 py-2.5 tabular-nums">{r.first ? `${r.first.pct}% (${fmtDate(r.first.date)})` : "—"}</td>
                <td className="px-3.5 py-2.5 tabular-nums">{r.last ? `${r.last.pct}% (${fmtDate(r.last.date)})` : "—"}</td>
                <td className="px-3.5 py-2.5">{r.mastered ? <span className="text-teal font-semibold">Mastery met</span> : r.sessions ? "In progress" : "No data"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="text-xs text-muted">v1 adds the narrative sections (background, summary of progress, recommendations, parent training) with AI drafting from this table, and PDF export for reauthorization packets.</div>
    </Shell>
  );
}
