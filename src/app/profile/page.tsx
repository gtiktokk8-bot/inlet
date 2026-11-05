import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Pill, fmtDate } from "@/components/ui";
import { ProfileForm } from "@/components/ProfileForm";
import { Files, type FileRow } from "@/components/Files";

export default async function MyProfile() {
  const { supabase, profile, user } = await requireUser();
  if (!profile || !user) redirect("/login");
  const [{ data: me }, { data: files }, { data: org }, { count: notes }, { count: sessions }] = await Promise.all([
    supabase.from("profiles").select("cert_expires_on").eq("id", profile.id).single(),
    supabase.from("files").select("id, name, size, mime, category, created_at, uploaded_by").eq("owner_kind", "staff").eq("owner_id", profile.id).order("created_at", { ascending: false }),
    supabase.from("orgs").select("name").eq("id", profile.org_id).single(),
    supabase.from("notes").select("id", { count: "exact", head: true }).eq("author_id", profile.id).in("status", ["signed", "cosigned"]),
    supabase.from("sessions").select("id", { count: "exact", head: true }).eq("staff_id", profile.id).eq("status", "ended"),
  ]);
  const cert = me?.cert_expires_on as string | null;
  const d = cert ? Math.round((Date.parse(cert) - Date.now()) / 86400e3) : null;
  return (
    <Shell profile={profile} active="/profile">
      <PageTitle title="My profile" sub={<span>{user.email} · {org?.name ?? "your clinic"} · {profile.role}</span>}
        actions={d !== null ? <Pill tone={d <= 14 ? "red" : d <= 45 ? "amber" : "teal"}>{profile.credential ?? "Cert"} renews {fmtDate(cert!)} · {d}d</Pill> : <Pill tone="amber">Add your certification date</Pill>} />
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs font-semibold text-muted">Sessions run</div><div className="text-3xl font-bold tabular-nums">{sessions ?? 0}</div></Card>
        <Card className="p-4"><div className="text-xs font-semibold text-muted">Notes signed</div><div className="text-3xl font-bold tabular-nums">{notes ?? 0}</div></Card>
        <Card className="p-4"><div className="text-xs font-semibold text-muted">Files on file</div><div className="text-3xl font-bold tabular-nums">{files?.length ?? 0}</div></Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2 p-4.5 h-fit">
          <div className="font-bold mb-3">Details</div>
          <ProfileForm initial={{ full_name: profile.full_name, credential: profile.credential ?? "", npi: profile.npi ?? "", cert_expires_on: cert ?? "" }} />
        </Card>
        <Card className="lg:col-span-3 p-4.5 h-fit flex flex-col gap-3">
          <div className="flex justify-between items-center"><div className="font-bold">My files</div><div className="text-xs text-muted">Certification, background check, CPR, training</div></div>
          <Files ownerKind="staff" ownerId={profile.id} orgId={profile.org_id} files={(files ?? []) as FileRow[]} canDelete />
        </Card>
      </div>
    </Shell>
  );
}
