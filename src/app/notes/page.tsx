import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { cosignQueue } from "@/lib/queries";
import { Shell } from "@/components/Shell";
import { Card, PageTitle, Pill, fmtDate, fmtTime } from "@/components/ui";
import { CosignButtons } from "@/components/CosignButtons";

export default async function Notes() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const queue = await cosignQueue(supabase);
  type Row = { id: string; session_id: string; status: string; signed_at: string | null; checklist: Record<string, boolean>; return_reason: string | null; sessions: { started_at: string; ended_at: string; cpt_code: string; clients: { first_name: string; last_name: string } | null } | null; author: { full_name: string; credential: string | null } | null };
  const rows = queue as unknown as Row[];
  return (
    <Shell profile={profile} active="/notes">
      <PageTitle title="Notes to sign" sub={`${rows.filter((r) => r.status === "signed").length} waiting · ${rows.filter((r) => r.status === "returned").length} returned to RBTs`} />
      <Card>
        {rows.length === 0 && <div className="p-6 text-sm text-muted">Queue is empty.</div>}
        {rows.map((n) => {
          const age = n.signed_at ? Math.round((Date.now() - Date.parse(n.signed_at)) / 3600e3) : 0;
          const pass = Object.values(n.checklist ?? {}).every(Boolean) && Object.keys(n.checklist ?? {}).length === 5;
          return (
            <div key={n.id} className="flex flex-wrap justify-between items-center gap-3 px-4.5 py-3.5 border-b border-line-soft last:border-0">
              <div>
                <Link href={`/session/${n.session_id}/note`} className="font-semibold no-underline text-ink">{n.sessions?.clients?.first_name} {n.sessions?.clients?.last_name}</Link>
                <span className="text-muted text-sm"> · {n.sessions?.cpt_code} · {n.sessions ? `${fmtDate(n.sessions.started_at)} ${fmtTime(n.sessions.started_at)}` : ""} · {n.author?.full_name}</span>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {n.status === "returned" ? <Pill tone="red">Returned: {n.return_reason}</Pill> : pass ? <Pill tone="teal">All 5 requirements met</Pill> : <Pill tone="amber">Requirements incomplete</Pill>}
                  {n.status === "signed" && <Pill tone={age >= 48 ? "red" : "gray"}>Signed {age}h ago</Pill>}
                </div>
              </div>
              {n.status === "signed" && <CosignButtons noteId={n.id} sessionId={n.session_id} />}
            </div>
          );
        })}
      </Card>
    </Shell>
  );
}
