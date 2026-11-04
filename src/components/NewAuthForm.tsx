"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthorization } from "@/app/actions";
import { Field, inputCls, Btn } from "./ui";
import { CPT_LABEL } from "@/lib/types";

export function NewAuthForm({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState({ client_id: clients[0]?.id ?? "", cpt_code: "97153", units: "", starts_on: "", ends_on: "", auth_number: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="flex flex-col gap-3">
      <Field label="Client"><select className={inputCls} value={f.client_id} onChange={(e) => set("client_id", e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Service"><select className={inputCls} value={f.cpt_code} onChange={(e) => set("cpt_code", e.target.value)}>{["97153", "97155", "97156", "97151", "97154", "97157"].map((c) => <option key={c} value={c}>{c} · {CPT_LABEL[c]}</option>)}</select></Field>
      <Field label="Units" hint="15-minute units"><input type="number" className={inputCls} value={f.units} onChange={(e) => set("units", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start"><input type="date" className={inputCls} value={f.starts_on} onChange={(e) => set("starts_on", e.target.value)} /></Field>
        <Field label="End"><input type="date" className={inputCls} value={f.ends_on} onChange={(e) => set("ends_on", e.target.value)} /></Field>
      </div>
      <Field label="Auth number"><input className={inputCls} value={f.auth_number} onChange={(e) => set("auth_number", e.target.value)} /></Field>
      {err && <div className="text-sm text-red">{err}</div>}
      <Btn disabled={busy || !f.client_id || !f.units || !f.starts_on || !f.ends_on} onClick={async () => { setBusy(true); setErr(null); try { await createAuthorization(f); setF((p) => ({ ...p, units: "", auth_number: "" })); router.refresh(); } catch (e) { setErr((e as Error).message); } setBusy(false); }}>{busy ? "Saving…" : "Add"}</Btn>
    </div>
  );
}
