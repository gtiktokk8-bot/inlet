"use client";
import { useState } from "react";
import { markClaimsSubmitted } from "@/app/actions";

export function SubmitClaims({ ids, rows }: { ids: string[]; rows: { dos: string; client: string; payer: string; cpt: string; units: number; pos: string; npi: string }[] }) {
  const [busy, setBusy] = useState(false);
  function exportCsv() {
    const head = "date_of_service,client,payer,cpt,units,place_of_service,rendering_npi";
    const body = rows.map((r) => [r.dos, r.client, r.payer, r.cpt, r.units, r.pos, r.npi].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([head + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `claims-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }
  return (
    <div className="flex gap-2">
      <button disabled={!ids.length} onClick={exportCsv} className="min-h-10 px-3.5 rounded-[10px] border border-[#cfcdc6] bg-card text-sm font-semibold disabled:opacity-50">Export CSV ({ids.length})</button>
      <button disabled={!ids.length || busy} onClick={async () => { setBusy(true); await markClaimsSubmitted(ids); setBusy(false); }} className="min-h-10 px-3.5 rounded-[10px] bg-ink text-white text-sm font-semibold disabled:opacity-50">Mark submitted</button>
    </div>
  );
}
