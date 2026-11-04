import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";
import { Card, PageTitle } from "@/components/ui";
import { OrgForm } from "@/components/OrgForm";

export default async function Settings() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  if (profile.role !== "owner") redirect("/");
  const [{ data: org }, { data: payers }] = await Promise.all([
    supabase.from("orgs").select("id, name, npi").eq("id", profile.org_id).single(),
    supabase.from("payers").select("id, name, type").order("name"),
  ]);
  return (
    <Shell profile={profile} active="/settings">
      <PageTitle title="Settings" sub="Clinic identity used on claims, and the payers you bill." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4.5">
          <div className="font-bold mb-3">Clinic</div>
          <OrgForm org={org as { name: string; npi: string | null }} />
        </Card>
        <Card className="p-4.5">
          <div className="font-bold mb-3">Payers</div>
          <div className="flex flex-col gap-2 text-sm">
            {((payers ?? []) as { id: string; name: string; type: string }[]).map((p) => (
              <div key={p.id} className="flex justify-between py-2 border-b border-line-soft last:border-0"><span className="font-medium">{p.name}</span><span className="text-muted">{p.type.replace("_", " ")}</span></div>
            ))}
          </div>
          <div className="text-xs text-muted mt-3">Add payers during client intake. Payer-specific note templates and modifiers come in v1.</div>
        </Card>
        <Card className="p-4.5 lg:col-span-2">
          <div className="font-bold mb-2">Before real client data</div>
          <ul className="text-sm text-muted list-disc pl-5 flex flex-col gap-1">
            <li>Hosting with a signed BAA (database and web host). This dev environment has none.</li>
            <li>Multi-factor authentication on for every login.</li>
            <li>A BAA with the AI vendor before turning on AI note drafting; until then, drafting runs on the built-in template.</li>
            <li>Written risk assessment and breach procedure on file.</li>
          </ul>
        </Card>
      </div>
    </Shell>
  );
}
