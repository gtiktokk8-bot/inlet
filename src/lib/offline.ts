"use client";
// Offline-first event log.
// Every tap is written to IndexedDB FIRST (synchronously from the user's point of view),
// then pushed to Supabase. Events carry a device-generated uuid, so a retry can never double-count.
import { openDB, type IDBPDatabase } from "idb";
import type { SessionEvent, Session } from "./types";
import { createClient } from "./supabase/client";

type Schema = {
  events: { key: string; value: SessionEvent & { synced: 0 | 1 }; indexes: { by_session: string; by_synced: number } };
  sessions: { key: string; value: Session & { synced: 0 | 1 } };
};

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB<Schema>("aba-offline", 1, {
      upgrade(d) {
        const ev = d.createObjectStore("events", { keyPath: "id" });
        ev.createIndex("by_session", "session_id");
        ev.createIndex("by_synced", "synced");
        d.createObjectStore("sessions", { keyPath: "id" });
      },
    });
  }
  return dbp;
}

export function deviceId() {
  const k = "aba-device-id";
  let v = localStorage.getItem(k);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(k, v);
  }
  return v;
}

export async function saveSessionLocal(s: Session) {
  await (await db()).put("sessions", { ...s, synced: 0 });
}

export async function appendEvent(e: SessionEvent) {
  await (await db()).put("events", { ...e, synced: 0 });
}

export async function localEvents(sessionId: string): Promise<SessionEvent[]> {
  const rows = await (await db()).getAllFromIndex("events", "by_session", sessionId);
  return rows.sort((a, b) => a.device_seq - b.device_seq);
}

export async function pendingCount() {
  const d = await db();
  const ev = await d.getAllFromIndex("events", "by_synced", 0);
  const ss = (await d.getAll("sessions")).filter((s) => s.synced === 0);
  return ev.length + ss.length;
}

/** Push everything unsynced. Safe to call repeatedly; the server upserts by id. */
export async function sync(): Promise<{ ok: boolean; pushed: number; error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, pushed: 0, error: "offline" };
  const d = await db();
  const supabase = createClient();
  let pushed = 0;
  const sessions = (await d.getAll("sessions")).filter((s) => s.synced === 0);
  for (const s of sessions) {
    const { synced, ...row } = s;
    void synced;
    const { error } = await supabase.from("sessions").upsert(row, { onConflict: "id" });
    if (error) return { ok: false, pushed, error: error.message };
    await d.put("sessions", { ...s, synced: 1 });
    pushed++;
  }
  const events = await d.getAllFromIndex("events", "by_synced", 0);
  for (let i = 0; i < events.length; i += 50) {
    const batch = events.slice(i, i + 50).map(({ synced, ...e }) => {
      void synced;
      return e;
    });
    const { error } = await supabase.from("session_events").upsert(batch, { onConflict: "id", ignoreDuplicates: true });
    if (error) return { ok: false, pushed, error: error.message };
    for (const e of events.slice(i, i + 50)) await d.put("events", { ...e, synced: 1 });
    pushed += batch.length;
  }
  return { ok: true, pushed };
}
