import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { listClients } from "@/lib/queries";
import { Shell } from "@/components/Shell";
import { Card, PageTitle } from "@/components/ui";

export default async function Clients() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const clients = await listClients(supabase);
  return (
    <Shell profile={profile} active="/clients">
      <PageTitle title="Clients" sub={`${clients.length} active`} />
      <Card>
        {clients.map((c) => (
          <Link key={c.id} href={`/clients/${c.id}`} className="flex justify-between items-center px-4.5 py-3.5 border-b border-line-soft last:border-0 no-underline text-ink">
            <div>
              <div className="font-semibold">{c.first_name} {c.last_name}</div>
              <div className="text-xs text-muted">DOB {c.dob} · {c.diagnosis_code ?? "—"} · {c.payers?.name ?? "no payer"}</div>
            </div>
            <span className="text-muted">›</span>
          </Link>
        ))}
      </Card>
    </Shell>
  );
}
