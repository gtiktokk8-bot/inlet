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

/** BCBA or the rendering staff fixes a session's clock (forgot to start timer, phone died). Audited by trigger. */
export async function updateSessionTimes(sessionId: string, startedAt: string, endedAt: string) {
  const start = Date.parse(startedAt), end = Date.parse(endedAt);
  if (!(start > 0 && end > 0)) throw new Error("invalid times");
  if (end <= start) throw new Error("end must be after start");
  if (end - start > 10 * 3600e3) throw new Error("a single session cannot exceed 10 hours");
  if (end > Date.now() + 5 * 60e3) throw new Error("end time is in the future");
  const sb = await createClient();
  const { data: note } = await sb.from("notes").select("status").eq("session_id", sessionId).maybeSingle();
  if (note && (note.status === "signed" || note.status === "cosigned")) throw new Error("return the note to draft before changing times");
  const { error } = await sb.from("sessions").update({ started_at: new Date(start).toISOString(), ended_at: new Date(end).toISOString(), status: "ended" }).eq("id", sessionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/session/${sessionId}/note`);
  revalidatePath("/today"); revalidatePath("/schedule");
}

async function orgOf(sb: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("not signed in");
  const { data: p } = await sb.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!p) throw new Error("no profile");
  return { user, org_id: p.org_id as string, role: p.role as string };
}

export async function createClientRecord(form: {
  first_name: string; last_name: string; dob: string; diagnosis_code: string; member_id: string;
  payer_id: string; new_payer_name: string; new_payer_type: string;
  guardian_name: string; guardian_relation: string; guardian_phone: string; guardian_email: string;
  auth_cpt: string; auth_units: string; auth_start: string; auth_end: string; auth_number: string;
}) {
  const sb = await createClient();
  const { user, org_id } = await orgOf(sb);
  let payer_id: string | null = form.payer_id || null;
  if (!payer_id && form.new_payer_name) {
    const { data: p, error } = await sb.from("payers").insert({ org_id, name: form.new_payer_name, type: form.new_payer_type || "commercial" }).select("id").single();
    if (error) throw new Error(error.message);
    payer_id = p.id;
  }
  const { data: c, error } = await sb.from("clients").insert({
    org_id, first_name: form.first_name.trim(), last_name: form.last_name.trim(), dob: form.dob, diagnosis_code: form.diagnosis_code || null,
    member_id: form.member_id || null, payer_id, lead_bcba_id: user.id,
  }).select("id").single();
  if (error || !c) throw new Error(error?.message ?? "could not create client");
  if (form.guardian_name) {
    await sb.from("guardians").insert({ client_id: c.id, full_name: form.guardian_name, relation: form.guardian_relation || null, phone: form.guardian_phone || null, email: form.guardian_email || null });
  }
  if (form.auth_units && form.auth_start && form.auth_end) {
    const { error: e2 } = await sb.from("authorizations").insert({ org_id, client_id: c.id, payer_id, cpt_code: form.auth_cpt || "97153", units_authorized: Number(form.auth_units), starts_on: form.auth_start, ends_on: form.auth_end, auth_number: form.auth_number || null });
    if (e2) throw new Error(e2.message);
  }
  revalidatePath("/"); revalidatePath("/clients"); revalidatePath("/authorizations");
  return c.id as string;
}

export async function createAuthorization(form: { client_id: string; cpt_code: string; units: string; starts_on: string; ends_on: string; auth_number: string }) {
  const sb = await createClient();
  const { org_id } = await orgOf(sb);
  const { data: c } = await sb.from("clients").select("payer_id").eq("id", form.client_id).single();
  const { error } = await sb.from("authorizations").insert({ org_id, client_id: form.client_id, payer_id: c?.payer_id ?? null, cpt_code: form.cpt_code, units_authorized: Number(form.units), starts_on: form.starts_on, ends_on: form.ends_on, auth_number: form.auth_number || null });
  if (error) throw new Error(error.message);
  revalidatePath("/authorizations"); revalidatePath("/"); revalidatePath(`/clients/${form.client_id}`);
}

export async function createAppointments(form: { client_id: string; staff_id: string; cpt_code: string; date: string; start: string; end: string; place_of_service: string; repeat_weeks: string }) {
  const sb = await createClient();
  const { org_id } = await orgOf(sb);
  const weeks = Math.max(1, Math.min(26, Number(form.repeat_weeks) || 1));
  const rows = [];
  for (let w = 0; w < weeks; w++) {
    const d = new Date(`${form.date}T00:00:00`); d.setDate(d.getDate() + w * 7);
    const day = d.toISOString().slice(0, 10);
    const starts = new Date(`${day}T${form.start}:00`), ends = new Date(`${day}T${form.end}:00`);
    if (ends <= starts) throw new Error("end must be after start");
    rows.push({ org_id, client_id: form.client_id, staff_id: form.staff_id, cpt_code: form.cpt_code, starts_at: starts.toISOString(), ends_at: ends.toISOString(), place_of_service: form.place_of_service });
  }
  const { error } = await sb.from("appointments").insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath("/schedule"); revalidatePath("/today");
}

export async function cancelAppointment(id: string) {
  const sb = await createClient();
  const { error } = await sb.from("appointments").update({ status: "cancelled" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/schedule"); revalidatePath("/today");
}

export async function updateOrg(form: { name: string; npi: string }) {
  const sb = await createClient();
  const { org_id, role } = await orgOf(sb);
  if (role !== "owner") throw new Error("owner only");
  const { error } = await sb.from("orgs").update({ name: form.name, npi: form.npi || null }).eq("id", org_id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateStaff(id: string, form: { credential: string; npi: string; cert_expires_on: string; role: string }) {
  const sb = await createClient();
  const { role } = await orgOf(sb);
  if (role !== "owner" && role !== "bcba") throw new Error("not allowed");
  const patch: Record<string, unknown> = { credential: form.credential || null, npi: form.npi || null, cert_expires_on: form.cert_expires_on || null };
  if (role === "owner") patch.role = form.role;
  const { error } = await sb.from("profiles").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/team");
}

/** Edit a scheduled appointment (not one that already has a session started). */
export async function updateAppointment(id: string, form: { client_id: string; staff_id: string; cpt_code: string; date: string; start: string; end: string; place_of_service: string }) {
  const sb = await createClient();
  const { data: s } = await sb.from("sessions").select("id").eq("appointment_id", id).maybeSingle();
  if (s) throw new Error("this appointment already has a session — fix times from the note instead");
  const starts = new Date(`${form.date}T${form.start}:00`), ends = new Date(`${form.date}T${form.end}:00`);
  if (!(starts.getTime() > 0 && ends.getTime() > 0)) throw new Error("invalid date or time");
  if (ends <= starts) throw new Error("end must be after start");
  const { error } = await sb.from("appointments").update({ client_id: form.client_id, staff_id: form.staff_id, cpt_code: form.cpt_code, starts_at: starts.toISOString(), ends_at: ends.toISOString(), place_of_service: form.place_of_service }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/schedule"); revalidatePath("/today");
}

/** Drag-and-drop: move an appointment to a new start, keeping its duration. */
export async function moveAppointment(id: string, newStartIso: string) {
  const sb = await createClient();
  const { data: a, error: e0 } = await sb.from("appointments").select("starts_at, ends_at").eq("id", id).single();
  if (e0 || !a) throw new Error(e0?.message ?? "appointment not found");
  const { data: s } = await sb.from("sessions").select("id").eq("appointment_id", id).maybeSingle();
  if (s) throw new Error("this appointment already has a session and can't be moved");
  const dur = Date.parse(a.ends_at) - Date.parse(a.starts_at);
  const start = Date.parse(newStartIso);
  if (!(start > 0)) throw new Error("invalid time");
  const { error } = await sb.from("appointments").update({ starts_at: new Date(start).toISOString(), ends_at: new Date(start + dur).toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/schedule"); revalidatePath("/today");
}

/* ---------------- Files (client & staff profiles) ---------------- */
export async function registerFile(form: { owner_kind: "client" | "staff"; owner_id: string; name: string; path: string; size: number; mime: string; category: string }) {
  const sb = await createClient();
  const { user, org_id } = await orgOf(sb);
  if (!form.path.startsWith(`${org_id}/`)) throw new Error("bad path");
  const { error } = await sb.from("files").insert({ org_id, owner_kind: form.owner_kind, owner_id: form.owner_id, name: form.name, path: form.path, size: form.size, mime: form.mime || null, category: form.category || "other", uploaded_by: user.id });
  if (error) throw new Error(error.message);
}
export async function fileUrl(id: string) {
  const sb = await createClient();
  const { data: f } = await sb.from("files").select("path").eq("id", id).single();
  if (!f) throw new Error("file not found");
  const { data, error } = await sb.storage.from("files").createSignedUrl(f.path, 300);
  if (error || !data) throw new Error(error?.message ?? "could not sign url");
  return data.signedUrl;
}
export async function deleteFile(id: string) {
  const sb = await createClient();
  const { data: f } = await sb.from("files").select("path").eq("id", id).single();
  if (!f) throw new Error("file not found");
  const { error } = await sb.from("files").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await sb.storage.from("files").remove([f.path]);
}

/* ---------------- My profile ---------------- */
export async function updateMyProfile(form: { full_name: string; credential: string; npi: string; cert_expires_on: string }) {
  const sb = await createClient();
  const { user } = await orgOf(sb);
  const { error } = await sb.from("profiles").update({ full_name: form.full_name.trim(), credential: form.credential || null, npi: form.npi || null, cert_expires_on: form.cert_expires_on || null }).eq("id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/profile"); revalidatePath("/team"); revalidatePath("/");
}
export async function changePassword(password: string) {
  if (password.length < 10) throw new Error("use at least 10 characters");
  const sb = await createClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}
