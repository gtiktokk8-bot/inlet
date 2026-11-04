import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { authUsage, listClients } from "@/lib/queries";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Pill, Progress, fmtDate, Empty } from "@/components/ui";
import { NewAuthForm } from "@/components/NewAuthForm";
import { CPT_LABEL } from "@/lib/types";

export default async function Authorizations() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const [auths, clients] = await Promise.all([authUsage(supabase), listClients(supabase)]);
  const name = (id: string) => { const c = clients.find((c) => c.id === id); return c ? `${c.first_name} ${c.last_name}` : "—"; };
  const sorted = [...auths].sort((a, b) => a.days_left - b.days_left);
  const active = sorted.filter((a) => a.days_left >= 0);
  const expired = sorted.filter((a) => a.days_left < 0);
  return (
    <Shell profile={profile} active="/authorizations">
      <PageTitle title="Authorizations" sub="Units burn down from co-signed notes. You get nudged at 60 and 30 days." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card>
            <div className="px-4.5 py-3.5 border-b border-line font-bold">Active · {active.length}</div>
            {active.length === 0 && <Empty title="No active authorizations" body="Add one on the right, or during client intake." />}
            {active.map((a) => (
              <div key={a.authorization_id} className="px-4.5 py-3.5 border-b border-line-soft last:border-0 flex flex-col gap-2">
                <div className="flex justify-between items-center gap-2 flex-wrap">
                  <div><Link href={`/clients/${a.client_id}`} className="font-semibold no-underline text-ink">{name(a.client_id)}</Link> <span className="text-muted text-sm">· {a.cpt_code} {CPT_LABEL[a.cpt_code]}</span></div>
                  <Pill tone={a.days_left <= 30 ? "red" : a.days_left <= 60 ? "amber" : "gray"}>{fmtDate(a.starts_on)} – {fmtDate(a.ends_on)} · {a.days_left}d left</Pill>
                </div>
                <Progress value={a.units_used} max={a.units_authorized} label="Units used" tone={a.units_used / a.units_authorized > 0.85 ? "gold" : "teal"} />
                {a.days_left <= 60 && <div className="text-xs text-amber-ink">Reassessment (97151) and reauthorization paperwork should be in motion. Most payers take 2–4 weeks.</div>}
              </div>
            ))}
          </Card>
          {expired.length > 0 && (
            <Card>
              <div className="px-4.5 py-3.5 border-b border-line font-bold text-muted">Expired · {expired.length}</div>
              {expired.map((a) => (
                <div key={a.authorization_id} className="px-4.5 py-3 border-b border-line-soft last:border-0 text-sm text-muted">{name(a.client_id)} · {a.cpt_code} · ended {fmtDate(a.ends_on)} · {a.units_used}/{a.units_authorized} used</div>
              ))}
            </Card>
          )}
        </div>
        <Card className="p-4.5 h-fit">
          <div className="font-bold mb-3">Add authorization</div>
          <NewAuthForm clients={clients.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` }))} />
        </Card>
      </div>
    </Shell>
  );
}
