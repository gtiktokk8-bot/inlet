import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { sessionBundle, targetStatus } from "@/lib/queries";
import { Collector } from "@/components/Collector";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const { id } = await params;
  const bundle = await sessionBundle(supabase, id);
  if (!bundle) redirect("/today");
  if (bundle.session.status !== "in_progress") redirect(`/session/${id}/note`);
  const statuses = await targetStatus(supabase, bundle.client.id);
  const lastData: Record<string, string | null> = {};
  for (const s of statuses) lastData[s.target_id] = s.last_data_at;
  return <Collector session={bundle.session} client={bundle.client} targets={bundle.targets} initialEvents={bundle.events} lastData={lastData} />;
}
