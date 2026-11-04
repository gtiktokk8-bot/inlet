import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Pill, Stat } from "@/components/ui";
import { SubmitClaims } from "@/components/SubmitClaims";

export default async function Billing() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const { data } = await supabase.from("claim_lines").select("*, clients(first_name, last_name), payers(name, type), profiles!claim_lines_rendering_provider_id_fkey(full_name, npi)").order("date_of_service", { ascending: false });
  type CL = { id: string; date_of_service: string; cpt_code: string; modifiers: string[]; units: number; place_of_service: string; status: string; clients: { first_name: string; last_name: string } | null; payers: { name: string; type: string } | null; profiles: { full_name: string; npi: string | null } | null };
  const rows = (data ?? []) as CL[];
  const ready = rows.filter((r) => r.status === "ready");
  const sum = (xs: CL[]) => xs.reduce((s, r) => s + r.units, 0);
  return (
    <Shell profile={profile} active="/billing">
      <PageTitle title="Billing" sub="Claim lines are generated from co-signed notes. Nothing here was typed by hand." actions={<SubmitClaims ids={ready.map((r) => r.id)} rows={ready.map((r) => ({ dos: r.date_of_service, client: `${r.clients?.first_name} ${r.clients?.last_name}`, payer: r.payers?.name ?? "", cpt: r.cpt_code, units: r.units, pos: r.place_of_service, npi: r.profiles?.npi ?? "" }))} />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Stat label="Ready to submit" value={ready.length} note={`${sum(ready)} units`} tone="teal" />
        <Stat label="Submitted" value={rows.filter((r) => r.status === "submitted").length} note={`${sum(rows.filter((r) => r.status === "submitted"))} units`} />
        <Stat label="Paid" value={rows.filter((r) => r.status === "paid").length} />
        <Stat label="Denied" value={rows.filter((r) => r.status === "denied").length} tone={rows.some((r) => r.status === "denied") ? "red" : "ink"} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[760px]">
          <thead className="text-muted text-left"><tr>
            {["DOS", "Client", "Payer", "CPT", "Mods", "Units", "POS", "Rendering", "Status"].map((h) => <th key={h} className="px-3.5 py-2.5 font-semibold border-b border-line">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line-soft last:border-0">
                <td className="px-3.5 py-2.5 tabular-nums">{r.date_of_service}</td>
                <td className="px-3.5 py-2.5 font-semibold">{r.clients?.first_name} {r.clients?.last_name}</td>
                <td className="px-3.5 py-2.5">{r.payers?.name ?? "—"}</td>
                <td className="px-3.5 py-2.5">{r.cpt_code}</td>
                <td className="px-3.5 py-2.5">{r.modifiers.join(" ") || "—"}</td>
                <td className="px-3.5 py-2.5 tabular-nums">{r.units}</td>
                <td className="px-3.5 py-2.5">{r.place_of_service}</td>
                <td className="px-3.5 py-2.5">{r.profiles?.full_name} <span className="text-muted">{r.profiles?.npi}</span></td>
                <td className="px-3.5 py-2.5"><Pill tone={r.status === "ready" ? "teal" : r.status === "denied" ? "red" : "gray"}>{r.status}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="text-xs text-muted">v0 exports an 837P-ready CSV for upload to Claim.MD / Office Ally. Direct clearinghouse submission and 835 remittance posting come in v1. Private-pay sessions should be invoiced, not claimed — filter coming.</div>
    </Shell>
  );
}
