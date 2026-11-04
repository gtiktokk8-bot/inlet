"use client";
import { cancelAppointment } from "@/app/actions";
export function CancelAppointment({ id }: { id: string }) {
  return <button onClick={async () => { if (confirm("Cancel this appointment?")) await cancelAppointment(id); }} className="text-[11px] text-muted underline">cancel</button>;
}
