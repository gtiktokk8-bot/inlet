import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { listClients, authUsage, targetStatus, cosignQueue } from "@/lib/queries";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Pill, Stat, Progress, fmtDate, Empty, Btn } from "@/components/ui";

/** Consecutive days (ending today or yesterday) on which every ended session got its note signed within 24h. */
function sameDayStreak(rows: { ended_at: string | null; signed_at: string | null }[]) {
  const byDay = new Map<string, boolean>();
  for (const r of rows) {
    if (!r.ended_at) continue;
    const day = new Date(r.ended_at).toDateString();
    const ok = !!r.signed_at && Date.parse(r.signed_at) - Date.parse(r.ended_at) <= 24 * 3600e3;
    byDay.set(day, (byDay.get(day) ?? true) && ok);
  }
  let streak = 0;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  // today may still be open; start counting from yesterday if today has unsigned work
  if (byDay.get(d.toDateString()) === false) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 90; i++) {
    const v = byDay.get(d.toDateString());
    if (v === false) break;
    if (v === true) streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export default async function Caseload() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  if (profile.role === "rbt") redirect("/today");

  const since = new Date(); since.setDate(since.getDate() - 90);
  const [clients, auths, statuses, queue, { data: staff }, { data: noteRows }] = await Promise.all([
    listClients(supabase), authUsage(supabase), targetStatus(supabase), cosignQueue(supabase),
    supabase.from("profiles").select("full_name, credential, cert_expires_on"),
    supabase.from("sessions").select("ended_at, notes(signed_at)").eq("status", "ended").gte("started_at", since.toISOString()),
  ]);

  const staleByClient = new Map<string, number>();
  for (const s of statuses) if (s.stale ?? true) staleByClient.set(s.client_id, (staleByClient.get(s.client_id) ?? 0) + 1);
  const staleTotal = [...staleByClient.values()].reduce((a, b) => a + b, 0);
  const expiring = auths.filter((a) => a.days_left <= 60 && a.days_left >= 0);
  const signedQueue = (queue as { status: string; signed_at: string | null }[]).filter((n) => n.status === "signed");
  const old = signedQueue.filter((n) => n.signed_at && Date.now() - Date.parse(n.signed_at) > 48 * 3600e3).length;
  const certs = ((staff ?? []) as { full_name: string; credential: string | null; cert_expires_on: string | null }[])
    .map((s) => ({ ...s, days: s.cert_expires_on ? Math.round((Date.parse(s.cert_expires_on) - Date.now()) / 86400e3) : null }))
    .filter((s) => s.days !== null && s.days <= 45);
  const streak = sameDayStreak(((noteRows ?? []) as { ended_at: string | null; notes: { signed_at: string | null } | { signed_at: string | null }[] | null }[])
    .map((r) => ({ ended_at: r.ended_at, signed_at: (Array.isArray(r.notes) ? r.notes[0] : r.notes)?.signed_at ?? null })));

  // Today's three: the highest-leverage actions, in order. Cleared items disappear, so the list shrinks to zero.
  const actions: { href: string; title: string; detail: string; tone: "red" | "amber" | "teal" }[] = [];
  if (signedQueue.length) actions.push({ href: "/notes", title: `Co-sign ${signedQueue.length} note${signedQueue.length === 1 ? "" : "s"}`, detail: old ? `${old} older than 48h — payer deadlines at risk` : "All within 48h", tone: old ? "red" : "amber" });
  for (const a of expiring.filter((a) => a.days_left <= 30).slice(0, 2)) {
    const c = clients.find((c) => c.id === a.client_id);
    actions.push({ href: "/authorizations", title: `Reauthorize ${c ? `${c.first_name} ${c.last_name}` : "client"} · ${a.cpt_code}`, detail: `Ends ${fmtDate(a.ends_on)} · ${a.days_left} days · ${a.units_used}/${a.units_authorized} units used`, tone: "red" });
  }
  if (staleTotal) actions.push({ href: `/clients/${[...staleByClient.entries()].sort((x, y) => y[1] - x[1])[0][0]}`, title: `${staleTotal} target${staleTotal === 1 ? "" : "s"} with no data in 3+ days`, detail: `Across ${staleByClient.size} client${staleByClient.size === 1 ? "" : "s"} — already pinned to the RBTs' "run next"`, tone: "amber" });
  for (const a of expiring.filter((a) => a.days_left > 30).slice(0, 1)) {
    const c = clients.find((c) => c.id === a.client_id);
    actions.push({ href: "/authorizations", title: `Start reauth paperwork · ${c ? `${c.first_name} ${c.last_name}` : ""}`, detail: `${a.cpt_code} ends in ${a.days_left} days`, tone: "amber" });
  }
  for (const s of certs.slice(0, 1)) actions.push({ href: "/team", title: `${s.full_name} · ${s.credential} renews in ${s.days} days`, detail: "Sessions after that date will be flagged until renewal is on file", tone: s.days! <= 14 ? "red" : "amber" });
  const three = actions.slice(0, 3);
  const hour = new Date().getHours();

  return (
    <Shell profile={profile} active="/">
      <PageTitle
        title={`Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, ${profile.full_name.split(" ")[0]}`}
        sub={`${clients.length} active clients · ${streak > 0 ? `${streak}-day streak of same-day notes` : "start a same-day-notes streak today"}`}
        actions={<Btn href="/clients/new">New client</Btn>}
      />

      <Card className="p-4.5">
        <div className="flex justify-between items-baseline mb-3">
          <div className="font-bold">Today&rsquo;s three</div>
          <div className="text-xs text-muted">{three.length ? `${three.length} to clear` : "clear"}</div>
        </div>
        {three.length === 0 ? (
          <Empty title="Nothing needs you right now." body="Notes are co-signed, authorizations are current, every target has fresh data. Go run a session or take the win." />
        ) : (
          <div className="flex flex-col gap-2">
            {three.map((a, i) => (
              <Link key={i} href={a.href} className="flex items-center gap-3 p-3 rounded-xl border border-line hover:border-teal no-underline text-ink">
                <span className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-sm font-bold ${a.tone === "red" ? "bg-red-soft text-red" : a.tone === "amber" ? "bg-gold-soft text-gold-ink" : "bg-teal-soft text-teal-ink"}`}>{i + 1}</span>
                <div className="min-w-0 grow">
                  <div className="font-semibold text-sm">{a.title}</div>
                  <div className="text-xs text-muted">{a.detail}</div>
                </div>
                <span className="text-muted">›</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat href="/notes" label="Notes awaiting co-sign" value={signedQueue.length} note={old ? `${old} are 48h+ old` : "none older than 48h"} tone={old ? "red" : "ink"} />
        <Stat label="Stale targets" value={staleTotal} note={`across ${staleByClient.size} clients`} />
        <Stat href="/authorizations" label="Auths ending ≤ 60 days" value={expiring.length} tone={expiring.some((a) => a.days_left <= 30) ? "red" : expiring.length ? "amber" : "ink"} note={expiring.length ? expiring.map((a) => `${a.cpt_code} in ${a.days_left}d`).join(" · ") : "nothing in the window"} />
        <Stat label="Same-day notes streak" value={streak} tone={streak >= 3 ? "teal" : "ink"} note={streak >= 3 ? "keep it going" : "every note signed the day of the session"} />
      </div>

      <Card>
        <div className="px-4.5 py-3.5 border-b border-line flex justify-between items-center">
          <div className="font-bold">Clients</div>
          <div className="text-xs text-muted">Sorted by what needs you first</div>
        </div>
        {clients.length === 0 && <Empty title="No clients yet" body="Add your first client to start scheduling sessions." action={<Btn href="/clients/new">New client</Btn>} />}
        <div className="overflow-x-auto">
          {clients.length > 0 && (
            <table className="w-full text-[13px] min-w-[640px]">
              <thead className="text-muted text-left">
                <tr>
                  <th className="px-4.5 py-2.5 font-semibold border-b border-line">Client</th>
                  <th className="px-3 py-2.5 font-semibold border-b border-line">Payer</th>
                  <th className="px-3 py-2.5 font-semibold border-b border-line w-[220px]">97153 auth</th>
                  <th className="px-3 py-2.5 font-semibold border-b border-line">Stale</th>
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
                      <td className="px-3 py-3">{a ? <Progress value={a.units_used} max={a.units_authorized} tone={a.units_used / a.units_authorized > 0.85 ? "gold" : "teal"} /> : <span className="text-muted">private pay</span>}</td>
                      <td className="px-3 py-3">{stale || "—"}</td>
                      <td className="px-4.5 py-3">
                        <div className="flex gap-1.5 flex-wrap">
                          {a && a.days_left <= 30 && <Pill tone="red">Auth ends {fmtDate(a.ends_on)} · {a.days_left}d</Pill>}
                          {a && a.days_left > 30 && a.days_left <= 60 && <Pill tone="amber">Auth ends {fmtDate(a.ends_on)} · {a.days_left}d</Pill>}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </Shell>
  );
}
