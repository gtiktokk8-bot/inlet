import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, Program, Target, SessionEvent, Session } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = SupabaseClient<any, "public", any>;

export async function listClients(sb: SB) {
  const { data } = await sb.from("clients").select("*, payers(name, type), lead:profiles!clients_lead_bcba_id_fkey(full_name)").eq("status", "active").order("last_name");
  return (data ?? []) as (Client & { payers: { name: string; type: string } | null; lead: { full_name: string } | null })[];
}

export async function authUsage(sb: SB) {
  const { data } = await sb.from("authorization_usage").select("*");
  return (data ?? []) as { authorization_id: string; client_id: string; cpt_code: string; units_authorized: number; units_used: number; starts_on: string; ends_on: string; days_left: number }[];
}

export async function targetStatus(sb: SB, clientId?: string) {
  let q = sb.from("target_status").select("*");
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q;
  return (data ?? []) as { target_id: string; program_id: string; client_id: string; last_data_at: string | null; stale: boolean | null }[];
}

export async function clientBook(sb: SB, clientId: string) {
  const [{ data: client }, { data: programs }, { data: guardians }] = await Promise.all([
    sb.from("clients").select("*, payers(name, type)").eq("id", clientId).single(),
    sb.from("programs").select("*, targets(*)").eq("client_id", clientId).eq("status", "active").order("created_at"),
    sb.from("guardians").select("*").eq("client_id", clientId),
  ]);
  const progs = (programs ?? []) as (Program & { targets: Target[] })[];
  for (const p of progs) p.targets.sort((a, b) => a.sort_order - b.sort_order);
  return { client: client as Client & { payers: { name: string; type: string } | null }, programs: progs, guardians: guardians ?? [] };
}

export async function targetHistory(sb: SB, targetId: string) {
  const { data: events } = await sb.from("session_events").select("*").eq("target_id", targetId).order("recorded_at");
  const evs = (events ?? []) as SessionEvent[];
  const sids = [...new Set(evs.map((e) => e.session_id))];
  const { data: sessions } = sids.length ? await sb.from("sessions").select("id, started_at, staff_id, profiles(full_name)").in("id", sids) : { data: [] };
  const dates: Record<string, string> = {};
  const staff: Record<string, string> = {};
  for (const s of (sessions ?? []) as unknown as { id: string; started_at: string; profiles: { full_name: string } | null }[]) {
    dates[s.id] = s.started_at;
    staff[s.id] = s.profiles?.full_name ?? "";
  }
  return { events: evs, dates, staff };
}

export async function sessionBundle(sb: SB, sessionId: string) {
  const { data: session } = await sb.from("sessions").select("*").eq("id", sessionId).single();
  if (!session) return null;
  const s = session as Session;
  const [{ data: client }, { data: programs }, { data: events }, { data: staff }, { data: note }] = await Promise.all([
    sb.from("clients").select("*").eq("id", s.client_id).single(),
    sb.from("programs").select("*, targets(*)").eq("client_id", s.client_id).eq("status", "active"),
    sb.from("session_events").select("*").eq("session_id", sessionId).order("device_seq"),
    sb.from("profiles").select("full_name, credential, npi").eq("id", s.staff_id).single(),
    sb.from("notes").select("*").eq("session_id", sessionId).maybeSingle(),
  ]);
  const targets = ((programs ?? []) as (Program & { targets: Target[] })[])
    .flatMap((p) => p.targets.map((t) => ({ ...t, program_name: p.name })))
    .filter((t) => t.phase !== "mastered" && t.phase !== "on_hold")
    .sort((a, b) => a.sort_order - b.sort_order);
  return { session: s, client: client as Client, targets, events: (events ?? []) as SessionEvent[], staff: staff as { full_name: string; credential: string | null; npi: string | null }, note };
}

export async function cosignQueue(sb: SB) {
  const { data } = await sb
    .from("notes")
    .select("*, sessions(started_at, ended_at, cpt_code, client_id, clients(first_name, last_name)), author:profiles!notes_author_id_fkey(full_name, credential)")
    .in("status", ["signed", "returned"])
    .order("signed_at", { ascending: true });
  return data ?? [];
}
