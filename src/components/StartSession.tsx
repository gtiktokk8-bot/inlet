"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSessionLocal, sync, deviceId } from "@/lib/offline";
import type { Session } from "@/lib/types";

export function StartSession({ appointment, orgId, staffId }: { appointment: { id: string; client_id: string; cpt_code: string; place_of_service: string }; orgId: string; staffId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    const s: Session = {
      id: crypto.randomUUID(),
      org_id: orgId,
      appointment_id: appointment.id,
      client_id: appointment.client_id,
      staff_id: staffId,
      cpt_code: appointment.cpt_code,
      started_at: new Date().toISOString(),
      ended_at: null,
      place_of_service: appointment.place_of_service,
      caregiver_present: null,
      status: "in_progress",
    };
    // Location stamp is best-effort and never blocks the start.
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }));
      Object.assign(s, { start_lat: pos.coords.latitude, start_lng: pos.coords.longitude });
    } catch { /* no location */ }
    Object.assign(s, { device_id: deviceId() });
    await saveSessionLocal(s);
    await sync();
    router.push(`/session/${s.id}`);
  }
  return (
    <button onClick={start} disabled={busy} className="min-h-10 px-3.5 rounded-[10px] bg-teal text-white text-sm font-semibold disabled:opacity-60">
      {busy ? "Starting…" : "Start session"}
    </button>
  );
}
