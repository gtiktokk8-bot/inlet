import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";
import { PageTitle } from "@/components/ui";
import { NewClientForm } from "@/components/NewClientForm";

export default async function NewClient() {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const { data: payers } = await supabase.from("payers").select("id, name, type").order("name");
  return (
    <Shell profile={profile} active="/clients">
      <PageTitle title="New client" sub="Three short steps. Everything can be edited later." />
      <NewClientForm payers={(payers ?? []) as { id: string; name: string; type: string }[]} />
    </Shell>
  );
}
