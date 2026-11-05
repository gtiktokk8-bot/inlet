"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerFile, fileUrl, deleteFile } from "@/app/actions";
import { fmtDate } from "./ui";

export type FileRow = { id: string; name: string; size: number; mime: string | null; category: string; created_at: string; uploaded_by: string | null };
const CATS: Record<"client" | "staff", [string, string][]> = {
  client: [["consent", "Consent / intake"], ["assessment", "Assessment"], ["treatment_plan", "Treatment plan"], ["auth", "Authorization letter"], ["insurance", "Insurance card"], ["report", "Progress report"], ["other", "Other"]],
  staff: [["cert", "Certification"], ["background", "Background check"], ["cpr", "CPR / first aid"], ["training", "Training"], ["hr", "HR / onboarding"], ["other", "Other"]],
};
const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function Files({ ownerKind, ownerId, orgId, files, canDelete }: { ownerKind: "client" | "staff"; ownerId: string; orgId: string; files: FileRow[]; canDelete: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState(CATS[ownerKind][0][0]);
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const label = (c: string) => CATS[ownerKind].find((x) => x[0] === c)?.[1] ?? c;

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy("upload"); setErr(null);
    try {
      const sb = createClient();
      for (const f of Array.from(list)) {
        if (f.size > 25 * 1048576) throw new Error(`${f.name} is over 25 MB`);
        const safe = f.name.replace(/[^\w.\-() ]+/g, "_");
        const path = `${orgId}/${ownerKind}/${ownerId}/${crypto.randomUUID()}-${safe}`;
        const { error } = await sb.storage.from("files").upload(path, f, { contentType: f.type || undefined, upsert: false });
        if (error) throw new Error(error.message);
        await registerFile({ owner_kind: ownerKind, owner_id: ownerId, name: f.name, path, size: f.size, mime: f.type, category: cat });
      }
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
    setBusy(null); if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="min-h-10 px-3 border border-[#cfcdc6] rounded-[10px] bg-card text-sm">{CATS[ownerKind].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <button disabled={busy !== null} onClick={() => input.current?.click()} className="min-h-10 px-3.5 rounded-[10px] bg-ink text-white text-sm font-semibold disabled:opacity-50">{busy === "upload" ? "Uploading…" : "Upload file"}</button>
        <span className="text-xs text-muted">PDF, images, docs · up to 25 MB each</span>
      </div>
      {err && <div className="text-sm text-red">{err}</div>}
      {files.length === 0 ? <div className="text-sm text-muted">No files yet.</div> : (
        <div className="flex flex-col">
          {files.map((f) => (
            <div key={f.id} aria-selected={selected === f.id} onClick={() => setSelected((s) => (s === f.id ? null : f.id))}
              className="flex items-center justify-between gap-3 px-3 py-2.5 border border-transparent border-b-line-soft last:border-b-transparent rounded-lg pressable cursor-pointer">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{f.name}</div>
                <div className="text-xs text-muted">{label(f.category)} · {fmtSize(f.size)} · {fmtDate(f.created_at)}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button disabled={busy !== null} onClick={async (e) => { e.stopPropagation(); setBusy(f.id); try { const u = await fileUrl(f.id); window.open(u, "_blank"); } catch (er) { setErr((er as Error).message); } setBusy(null); }} className="min-h-9 px-3 rounded-[10px] border border-[#cfcdc6] bg-card text-xs font-semibold">{busy === f.id ? "…" : "Open"}</button>
                {canDelete && <button disabled={busy !== null} onClick={async (e) => { e.stopPropagation(); if (!confirm(`Delete ${f.name}?`)) return; setBusy(f.id); try { await deleteFile(f.id); router.refresh(); } catch (er) { setErr((er as Error).message); } setBusy(null); }} className="min-h-9 px-3 rounded-[10px] border border-[#f3c3bf] bg-card text-xs font-semibold text-red">Delete</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
