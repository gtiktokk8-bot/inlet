import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";
import { PageTitle } from "@/components/ui";
import { NewProgramForm } from "@/components/NewProgramForm";

export default async function NewProgram({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const { id } = await params;
  const { data: client } = await supabase.from("clients").select("first_name, last_name").eq("id", id).single();
  if (!client) redirect("/clients");
  return (
    <Shell profile={profile} active="/clients">
      <PageTitle title={`Add goal · ${client.first_name} ${client.last_name}`} sub="Pick a starting point from the goal bank, then edit anything. Goal text is a draft to individualize." />
      <NewProgramForm clientId={id} />
    </Shell>
  );
}
