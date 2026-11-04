import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { sessionBundle } from "@/lib/queries";
import { buildFacts } from "@/lib/note-draft";
import { unitsFromMinutes } from "@/lib/clinical";
import { NoteEditor } from "@/components/NoteEditor";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireUser();
  if (!profile) redirect("/login");
  const { id } = await params;
  const b = await sessionBundle(supabase, id);
  if (!b) redirect("/today");
  const mins = Math.round(((b.session.ended_at ? Date.parse(b.session.ended_at) : Date.now()) - Date.parse(b.session.started_at)) / 60000);
  const facts = buildFacts({
    session: b.session, events: b.events, targets: b.targets,
    staffName: b.staff.full_name, staffCredential: b.staff.credential ?? "", clientInitials: `${b.client.first_name[0]}.${b.client.last_name[0]}.`, units: unitsFromMinutes(mins),
  });
  // previous signed note for this client (for "copy last note")
  const { data: prev } = await supabase
    .from("notes").select("body, sessions!inner(client_id, started_at)")
    .eq("sessions.client_id", b.client.id).in("status", ["signed", "cosigned"]).neq("session_id", id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const quickNotes = b.events.filter((e) => e.kind === "note").map((e) => String(e.payload.text ?? ""));
  return (
    <NoteEditor
      sessionId={id}
      facts={facts}
      client={{ name: `${b.client.first_name} ${b.client.last_name}`, payer: "" }}
      existing={b.note as { body: string; status: string; checklist: Record<string, boolean>; return_reason: string | null } | null}
      previous={(prev as { body: string } | null)?.body ?? null}
      quickNotes={quickNotes}
      canEdit={profile.id === b.session.staff_id || profile.role === "bcba" || profile.role === "owner"}
      isBcba={profile.role === "bcba" || profile.role === "owner"}
      noteId={(b.note as { id: string } | null)?.id ?? null}
    />
  );
}
