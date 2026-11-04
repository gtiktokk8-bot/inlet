"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveNote(sessionId: string, body: string, checklist: Record<string, boolean>, caregiverPresent: boolean | null) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("not signed in");
  const { data: s } = await sb.from("sessions").select("org_id").eq("id", sessionId).single();
  if (!s) throw new Error("session not found");
  if (caregiverPresent !== null) await sb.from("sessions").update({ caregiver_present: caregiverPresent }).eq("id", sessionId);
  const { error } = await sb.from("notes").upsert({ org_id: s.org_id, session_id: sessionId, author_id: user.id, body, checklist, status: "draft" }, { onConflict: "session_id" });
  if (error) throw new Error(error.message);
  revalidatePath(`/session/${sessionId}/note`);
}

export async function signNote(sessionId: string, body: string, checklist: Record<string, boolean>, caregiverPresent: boolean | null) {
  if (!Object.values(checklist).every(Boolean)) throw new Error("all payer requirements must pass before signing");
  await saveNote(sessionId, body, checklist, caregiverPresent);
  const sb = await createClient();
  const { error } = await sb.from("notes").update({ status: "signed", signed_at: new Date().toISOString() }).eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/session/${sessionId}/note`);
  revalidatePath("/today");
  revalidatePath("/notes");
}

export async function cosignNote(noteId: string) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("not signed in");
  const { error } = await sb.from("notes").update({ status: "cosigned", cosigned_by: user.id, cosigned_at: new Date().toISOString() }).eq("id", noteId);
  if (error) throw new Error(error.message);
  revalidatePath("/notes"); revalidatePath("/billing"); revalidatePath("/");
}

export async function returnNote(noteId: string, reason: string) {
  const sb = await createClient();
  const { error } = await sb.from("notes").update({ status: "returned", return_reason: reason }).eq("id", noteId);
  if (error) throw new Error(error.message);
  revalidatePath("/notes");
}

export async function addProgram(clientId: string, form: { name: string; domain: string; goal_text: string; source: string; target_name: string; data_type: string; sd: string; steps: string }) {
  const sb = await createClient();
  const { data: c } = await sb.from("clients").select("org_id").eq("id", clientId).single();
  if (!c) throw new Error("client not found");
  const { data: p, error } = await sb.from("programs").insert({ org_id: c.org_id, client_id: clientId, name: form.name, domain: form.domain || null, goal_text: form.goal_text, source: form.source || "custom" }).select("id").single();
  if (error || !p) throw new Error(error?.message ?? "insert failed");
  const steps = form.data_type === "task_analysis" ? form.steps.split("\n").map((s) => s.trim()).filter(Boolean) : null;
  const { error: e2 } = await sb.from("targets").insert({ org_id: c.org_id, program_id: p.id, name: form.target_name || form.name, data_type: form.data_type, sd: form.sd || null, steps, sort_order: 99 });
  if (e2) throw new Error(e2.message);
  revalidatePath(`/clients/${clientId}`);
}

export async function markClaimsSubmitted(ids: string[]) {
  const sb = await createClient();
  const { error } = await sb.from("claim_lines").update({ status: "submitted", submitted_at: new Date().toISOString() }).in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/billing");
}
