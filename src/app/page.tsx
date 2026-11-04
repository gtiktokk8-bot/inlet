import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { listClients, authUsage, targetStatus, cosignQueue } from "@/lib/queries";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Pill, Stat, initials, fmtDate } from "@/components/ui";

export default async function Caseload() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  if (profile.role === "rbt") redirect("/today");

  const [clients, auths, statuses, queue] = await Promise.all([
    listClients(supabase),
    authUsage(supabase),
    targetStatus(supabase),
    cosignQueue(supabase),
  ]);

  const staleByClient = new Map<string, number>();
  for (const s of statuses) if (s.stale ?? true) staleByClient.set(s.client_id, (staleByClient.get(s.client_id) ?? 0) + 1);
  const expiring = auths.filter((a) => a.days_left <= 60 && a.days_left >= 0 && a.cpt_code === "97153");
  const staleTotal = [...staleByClient.values()].reduce((a, b) => a + b, 0);
  const old = queue.filter((n: { signed_at: string | null }) => n.signed_at && Date.now() - Date.parse(n.signed_at) > 48 * 3600e3).length;

  return (
    <Shell profile={profile} active="/">
      <PageTitle title={`Good ${new Date().getHours() < 12 ? "morning" : "afternoon"}`} sub={`${clients.length} active clients · ${queue.length} notes waiting for you`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Link href="/notes" className="no-underline text-ink"><Stat label="Notes awaiting your co-sign" value={queue.length} note={old ? `${old} are 48h+ old` : "none older than 48h"} /></Link>
        <Stat label="Targets with no data in 3+ days" value={staleTotal} note={`across ${staleByClient.size} clients · pinned to RBT "run next"`} />
        <Stat label="Authorizations expiring ≤ 60 days" value={expiring.length} tone={expiring.some((a) => a.days_left <= 30) ? "red" : expiring.length ? "amber" : "ink"} note={expiring.map((a) => `${initials(clients.find((c) => c.id === a.client_id) ?? { first_name: "?", last_name: "?" })} in ${a.days_left}d`).join(" · ") || "nothing in the window"} />
        <Stat label="Supervision this month" value="—" note="BACB 5% · computed from 97155 vs 97153 units (v1)" />
      </div>

      <Card>
        <div className="px-4.5 py-3.5 border-b border-line flex justify-between items-center">
          <div className="font-bold">Clients</div>
          <div className="text-xs text-muted">Sorted by what needs you first</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[640px]">
            <thead className="text-muted text-left">
              <tr>
                <th className="px-4.5 py-2.5 font-semibold border-b border-line">Client</th>
                <th className="px-3 py-2.5 font-semibold border-b border-line">Payer</th>
                <th className="px-3 py-2.5 font-semibold border-b border-line">97153 auth</th>
                <th className="px-3 py-2.5 font-semibold border-b border-line">Stale targets</th>
                <th className="px-4.5 py-2.5 font-semibold border-b border-line">Flags</th>
              </tr>
            </thead>
            <tbody>
              {clients
                .map((c) => {
                  const a = auths.find((x) => x.client_id === c.id && x.cpt_code === "97153");
                  const stale = staleByClient.get(c.id) ?? 0;
                  const score = (a && a.days_left <= 60 ? 2 : 0) + (stale > 0 ? 1 : 0) + (a && a.units_used / a.units_authorized > 0.85 ? 1 : 0);
                  return { c, a, stale, score };
                })
                .sort((x, y) => y.score - x.score)
                .map(({ c, a, stale }) => (
                  <tr key={c.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4.5 py-3">
                      <Link href={`/clients/${c.id}`} className="font-semibold no-underline text-ink">{c.first_name} {c.last_name}</Link>
                      <div className="text-xs text-muted">Lead: {c.lead?.full_name ?? "—"}</div>
                    </td>
                    <td className="px-3 py-3">{c.payers?.name ?? "—"}</td>
                    <td className="px-3 py-3">
                      {a ? (
                        <div className="flex items-center gap-2">
                          <div className="grow h-1.5 bg-line-soft rounded overflow-hidden"><div className={`h-full ${a.units_used / a.units_authorized > 0.85 ? "bg-amber" : "bg-teal"}`} style={{ width: `${Math.min(100, (a.units_used / a.units_authorized) * 100)}%` }} /></div>
                          <span className="tabular-nums">{a.units_used}/{a.units_authorized} u</span>
                        </div>
                      ) : <span className="text-muted">n/a</span>}
                    </td>
                    <td className="px-3 py-3">{stale}</td>
                    <td className="px-4.5 py-3 flex gap-1.5 flex-wrap">
                      {a && a.days_left <= 30 && <Pill tone="red">Auth ends {fmtDate(a.ends_on)} · {a.days_left}d</Pill>}
                      {a && a.days_left > 30 && a.days_left <= 60 && <Pill tone="amber">Auth ends {fmtDate(a.ends_on)} · {a.days_left}d</Pill>}
                      {stale > 0 && <Pill tone="gray">{stale} stale</Pill>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Shell>
  );
}
