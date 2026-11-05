import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";
import Link from "next/link";
import { Card, PageTitle, Pill, fmtDate } from "@/components/ui";
import { TeamForms } from "@/components/TeamForms";

export default async function Team() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  if (!["owner", "bcba"].includes(profile.role)) redirect("/");
  const { data: staff } = await supabase.from("profiles").select("id, full_name, role, credential, npi, cert_expires_on").order("full_name");
  type S = { id: string; full_name: string; role: string; credential: string | null; npi: string | null; cert_expires_on: string | null };
  const rows = (staff ?? []) as S[];
  return (
    <Shell profile={profile} active="/team">
      <PageTitle title="Team" sub="Logins, roles, and credential dates. Expiring credentials show up on the caseload 45 days out." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="px-4.5 py-3.5 border-b border-line font-bold">Staff · {rows.length}</div>
          {rows.map((s) => {
            const d = s.cert_expires_on ? Math.round((Date.parse(s.cert_expires_on) - Date.now()) / 86400e3) : null;
            return (
              <div key={s.id} className="px-4.5 py-3.5 border-b border-line-soft last:border-0 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <div className="font-semibold"><Link href={`/team/${s.id}`} className="text-ink no-underline hover:underline">{s.full_name}</Link> <span className="text-muted font-normal text-sm">· {s.credential ?? "—"} · {s.role}</span></div>
                  <div className="text-xs text-muted">NPI {s.npi ?? "—"} · cert {s.cert_expires_on ? `renews ${fmtDate(s.cert_expires_on)}` : "date not set"} · <Link href={`/team/${s.id}`}>profile &amp; files</Link></div>
                </div>
                <div className="flex items-center gap-2">
                  {d !== null && d <= 45 && <Pill tone={d <= 14 ? "red" : "amber"}>{d}d to renewal</Pill>}
                  <TeamForms mode="edit" staff={s} canSetRole={profile.role === "owner"} />
                </div>
              </div>
            );
          })}
        </Card>
        <Card className="p-4.5 h-fit">
          <div className="font-bold mb-1">Add a login</div>
          <div className="text-xs text-muted mb-3">Creates the account in this clinic. Share the temporary password in person; they can change it after signing in.</div>
          <TeamForms mode="create" />
        </Card>
      </div>
    </Shell>
  );
}
