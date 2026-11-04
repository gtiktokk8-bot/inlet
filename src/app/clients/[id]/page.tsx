import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { clientBook, targetStatus, targetHistory, authUsage } from "@/lib/queries";
import { sessionSeries, mastered, countStats, isStale } from "@/lib/clinical";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Pill, Btn, fmtDate } from "@/components/ui";
import { TrendChart } from "@/components/TrendChart";
import { CPT_LABEL } from "@/lib/types";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const { id } = await params;
  const { t } = await searchParams;
  const [{ client, programs, guardians }, statuses, auths] = await Promise.all([clientBook(supabase, id), targetStatus(supabase, id), authUsage(supabase)]);
  if (!client) redirect("/clients");

  const allTargets = programs.flatMap((p) => p.targets.map((x) => ({ ...x, program_name: p.name, source: p.source })));
  const lastData = new Map(statuses.map((s) => [s.target_id, s.last_data_at]));
  const sorted = [...allTargets].sort((a, b) => Number(isStale(lastData.get(b.id) ?? null)) - Number(isStale(lastData.get(a.id) ?? null)));
  const selected = allTargets.find((x) => x.id === t) ?? sorted[0];

  let chart: { date: string; value: number; label?: string }[] = [];
  let isMastered = false;
  let unit = "%";
  let yMax = 100;
  let byStaff: Record<string, { n: number; ind: number }> = {};
  if (selected) {
    const { events, dates, staff } = await targetHistory(supabase, selected.id);
    if (selected.data_type === "trial") {
      const series = sessionSeries(events, dates);
      chart = series.map((p) => ({ date: p.date, value: p.pct ?? 0, label: `${p.n} trials · ${staff[p.session_id] ?? ""}` }));
      isMastered = mastered(selected, series);
      for (const p of series) {
        const name = staff[p.session_id] || "—";
        byStaff[name] = byStaff[name] ?? { n: 0, ind: 0 };
        byStaff[name].n += p.n; byStaff[name].ind += p.independent;
      }
    } else if (selected.data_type === "frequency") {
      const by = new Map<string, number>();
      for (const e of events) by.set(e.session_id, (by.get(e.session_id) ?? 0) + (e.kind === "count" ? 1 : 0));
      chart = [...by.entries()].map(([sid, n]) => ({ date: dates[sid], value: n })).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      unit = ""; yMax = Math.max(10, ...chart.map((c) => c.value));
      void countStats;
    } else if (selected.data_type === "task_analysis") {
      unit = "%";
    }
  }
  byStaff = Object.fromEntries(Object.entries(byStaff).map(([k, v]) => [k, v]));
  const clientAuths = auths.filter((a) => a.client_id === id);

  return (
    <Shell profile={profile} active="/clients">
      <PageTitle
        title={`${client.first_name} ${client.last_name}`}
        sub={<span>DOB {client.dob} · {client.diagnosis_code} · {client.payers?.name ?? "no payer"} · Guardian: {guardians.map((g: { full_name: string; relation: string | null }) => `${g.full_name} (${g.relation})`).join(", ") || "—"}</span>}
        actions={<><Btn variant="secondary" href={`/clients/${id}/report`}>Progress report</Btn><Btn href={`/clients/${id}/programs/new`}>Add goal</Btn></>}
      />
      <div className="flex gap-2 flex-wrap">
        {clientAuths.map((a) => (
          <Pill key={a.authorization_id} tone={a.days_left <= 30 ? "red" : a.days_left <= 60 ? "amber" : "gray"}>
            {a.cpt_code} · {a.units_used}/{a.units_authorized} units · ends {fmtDate(a.ends_on)} ({a.days_left}d)
          </Pill>
        ))}
        {clientAuths.length === 0 && <Pill tone="gray">No authorizations on file (private pay)</Pill>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="px-4.5 py-3.5 border-b border-line flex justify-between items-center">
            <div className="font-bold">Programs · {allTargets.length} targets</div>
            <div className="text-xs text-muted">Stale first</div>
          </div>
          {sorted.map((x) => {
            const stale = isStale(lastData.get(x.id) ?? null);
            const sel = selected?.id === x.id;
            return (
              <Link key={x.id} href={`/clients/${id}?t=${x.id}`} className={`flex justify-between items-center gap-2 px-4.5 py-3 border-b border-line-soft last:border-0 no-underline text-ink ${sel ? "bg-teal-soft" : ""}`}>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{x.program_name}</div>
                  <div className="text-xs text-muted">{x.name} · {x.data_type.replace("_", " ")} · {x.source ?? "custom"}{lastData.get(x.id) ? ` · last data ${fmtDate(lastData.get(x.id)!)}` : " · no data"}</div>
                </div>
                {x.phase === "mastered" ? <Pill tone="teal">Mastered</Pill> : stale ? <Pill tone="amber">Stale</Pill> : <Pill tone="gray">{x.phase}</Pill>}
              </Link>
            );
          })}
        </Card>

        <Card className="lg:col-span-3 p-4.5 flex flex-col gap-3">
          {selected ? (
            <>
              <div className="flex flex-wrap justify-between gap-2 items-start">
                <div>
                  <div className="font-bold">{selected.program_name}</div>
                  <div className="text-xs text-muted">{selected.name}{selected.sd ? ` · SD "${selected.sd}"` : ""} · mastery {selected.mastery?.pct ?? 80}% × {selected.mastery?.sessions ?? 3} sessions</div>
                </div>
                <div className="flex gap-1.5">
                  <Btn variant="secondary" className="min-h-8 text-xs">Add phase line</Btn>
                  <Btn variant="secondary" className="min-h-8 text-xs">Schedule IOA</Btn>
                </div>
              </div>
              {isMastered && selected.phase !== "mastered" && (
                <div className="px-3 py-2.5 rounded-[10px] bg-teal-soft text-teal text-[13px] font-semibold">Mastery criterion met across the last {selected.mastery?.sessions ?? 3} sessions — review and move to maintenance.</div>
              )}
              {selected.data_type === "trial" || selected.data_type === "frequency" ? (
                <TrendChart points={chart} masteryPct={selected.data_type === "trial" ? selected.mastery?.pct ?? 80 : undefined} phaseChanges={selected.phase_changes ?? []} yMax={yMax} unit={unit} />
              ) : (
                <div className="text-sm text-muted p-6 text-center">Graphing for {selected.data_type.replace("_", " ")} targets lands in v1.</div>
              )}
              {Object.keys(byStaff).length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[13px]">
                  {Object.entries(byStaff).map(([name, v]) => (
                    <div key={name} className="px-3 py-2.5 bg-ground rounded-[10px]"><div className="text-xs text-muted">By RBT · {name}</div><div className="font-semibold">{v.n ? Math.round((v.ind / v.n) * 100) : 0}% · {v.n} trials</div></div>
                  ))}
                </div>
              )}
              <div className="text-xs text-muted">Goal: {programs.find((p) => p.id === selected.program_id)?.goal_text}</div>
            </>
          ) : (
            <div className="text-sm text-muted">No programs yet. Add a goal to begin.</div>
          )}
        </Card>
      </div>
      <div className="text-xs text-muted">Billing codes in use: {clientAuths.map((a) => `${a.cpt_code} — ${CPT_LABEL[a.cpt_code] ?? ""}`).join(" · ")}</div>
    </Shell>
  );
}
