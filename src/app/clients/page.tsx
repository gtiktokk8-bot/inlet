import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { listClients } from "@/lib/queries";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Btn, Empty } from "@/components/ui";

export default async function Clients() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const clients = await listClients(supabase);
  return (
    <Shell profile={profile} active="/clients">
      <PageTitle title="Clients" sub={`${clients.length} active`} actions={<Btn href="/clients/new">New client</Btn>} />
      <Card>
        {clients.length === 0 && <Empty title="No clients yet" body="Add your first client — it takes about a minute." action={<Btn href="/clients/new">New client</Btn>} />}
        {clients.map((c) => (
          <Link key={c.id} href={`/clients/${c.id}`} className="flex justify-between items-center px-4.5 py-3.5 border-b border-line-soft last:border-0 no-underline text-ink pressable">
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
