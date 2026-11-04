"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOrg } from "@/app/actions";
import { Field, inputCls, Btn } from "./ui";

export function OrgForm({ org }: { org: { name: string; npi: string | null } }) {
  const router = useRouter();
  const [f, setF] = useState({ name: org.name, npi: org.npi ?? "" });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <Field label="Clinic name"><input className={inputCls} value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} /></Field>
      <Field label="Group NPI" hint="Type 2 NPI used as the billing provider on claims"><input className={inputCls} value={f.npi} onChange={(e) => setF((p) => ({ ...p, npi: e.target.value }))} /></Field>
      {msg && <div className="text-sm text-teal-ink">{msg}</div>}
      <div className="flex justify-end"><Btn disabled={busy} onClick={async () => { setBusy(true); try { await updateOrg(f); setMsg("Saved."); router.refresh(); } catch (e) { setMsg((e as Error).message); } setBusy(false); }}>{busy ? "Saving…" : "Save"}</Btn></div>
    </div>
  );
}
