import { redirect, notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Pill, Btn, fmtDate } from "@/components/ui";
import { Files, type FileRow } from "@/components/Files";
import { TeamForms } from "@/components/TeamForms";

export default async function StaffProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  if (!["owner", "bcba"].includes(profile.role)) redirect("/");
  const { data: s } = await supabase.from("profiles").select("id, full_name, role, credential, npi, cert_expires_on").eq("id", id).single();
  if (!s) notFound();
  const [{ data: files }, { count: sessions }, { count: notes }] = await Promise.all([
    supabase.from("files").select("id, name, size, mime, category, created_at, uploaded_by").eq("owner_kind", "staff").eq("owner_id", id).order("created_at", { ascending: false }),
    supabase.from("sessions").select("id", { count: "exact", head: true }).eq("staff_id", id).eq("status", "ended"),
    supabase.from("notes").select("id", { count: "exact", head: true }).eq("author_id", id).in("status", ["signed", "cosigned"]),
  ]);
  const d = s.cert_expires_on ? Math.round((Date.parse(s.cert_expires_on) - Date.now()) / 86400e3) : null;
  return (
    <Shell profile={profile} active="/team">
      <PageTitle title={s.full_name} sub={<span>{s.credential ?? "—"} · {s.role} · NPI {s.npi ?? "—"}</span>}
        actions={<><Btn variant="secondary" href="/team">← Team</Btn><TeamForms mode="edit" staff={s} canSetRole={profile.role === "owner"} /></>} />
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs font-semibold text-muted">Sessions run</div><div className="text-3xl font-bold tabular-nums">{sessions ?? 0}</div></Card>
        <Card className="p-4"><div className="text-xs font-semibold text-muted">Notes signed</div><div className="text-3xl font-bold tabular-nums">{notes ?? 0}</div></Card>
        <Card className="p-4"><div className="text-xs font-semibold text-muted">Credential</div><div className="text-sm font-bold mt-2">{d !== null ? <Pill tone={d <= 14 ? "red" : d <= 45 ? "amber" : "teal"}>renews {fmtDate(s.cert_expires_on!)} · {d}d</Pill> : <Pill tone="amber">date not set</Pill>}</div></Card>
      </div>
      <Card className="p-4.5 flex flex-col gap-3">
        <div className="flex justify-between items-center"><div className="font-bold">Files</div><div className="text-xs text-muted">Certification, background check, CPR, training, HR</div></div>
        <Files ownerKind="staff" ownerId={id} orgId={profile.org_id} files={(files ?? []) as FileRow[]} canDelete />
      </Card>
    </Shell>
  );
}
