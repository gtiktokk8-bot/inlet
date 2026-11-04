"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateStaff } from "@/app/actions";
import { Field, inputCls, Btn } from "./ui";

const ROLES = [["rbt", "RBT"], ["bcaba", "BCaBA"], ["bcba", "BCBA"], ["biller", "Biller"], ["owner", "Owner"]];

export function TeamForms({ mode, staff, canSetRole }: { mode: "create" | "edit"; staff?: { id: string; full_name: string; role: string; credential: string | null; npi: string | null; cert_expires_on: string | null }; canSetRole?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(mode === "create");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null);
  const [f, setF] = useState({ email: "", password: "", full_name: staff?.full_name ?? "", role: staff?.role ?? "rbt", credential: staff?.credential ?? "RBT", npi: staff?.npi ?? "", cert_expires_on: staff?.cert_expires_on ?? "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit() {
    setBusy(true); setErr(null); setOk(null);
    try {
      if (mode === "create") {
        const { error } = await createClient().rpc("create_staff_user", { p_email: f.email, p_password: f.password, p_full_name: f.full_name, p_role: f.role, p_credential: f.credential || null, p_npi: f.npi || null, p_cert_expires_on: f.cert_expires_on || null });
        if (error) throw new Error(error.message);
        setOk(`${f.full_name} can now sign in as ${f.email}.`);
        setF((p) => ({ ...p, email: "", password: "", full_name: "" }));
      } else if (staff) {
        await updateStaff(staff.id, { credential: f.credential, npi: f.npi, cert_expires_on: f.cert_expires_on, role: f.role });
        setOpen(false);
      }
      router.refresh();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  if (mode === "edit" && !open) return <Btn variant="secondary" className="min-h-8 text-xs" onClick={() => setOpen(true)}>Edit</Btn>;

  return (
    <div className={`flex flex-col gap-3 ${mode === "edit" ? "w-full basis-full p-3 rounded-xl bg-ground" : ""}`}>
      {mode === "create" && (
        <>
          <Field label="Full name"><input className={inputCls} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
          <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Temporary password" hint="At least 10 characters"><input type="text" className={inputCls} value={f.password} onChange={(e) => set("password", e.target.value)} /></Field>
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role"><select className={inputCls} value={f.role} disabled={mode === "edit" && !canSetRole} onChange={(e) => { set("role", e.target.value); set("credential", e.target.value === "rbt" ? "RBT" : e.target.value === "bcba" ? "BCBA" : e.target.value === "bcaba" ? "BCaBA" : f.credential); }}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Credential"><input className={inputCls} value={f.credential} onChange={(e) => set("credential", e.target.value)} /></Field>
        <Field label="NPI"><input className={inputCls} value={f.npi} onChange={(e) => set("npi", e.target.value)} /></Field>
        <Field label="Cert renews on"><input type="date" className={inputCls} value={f.cert_expires_on} onChange={(e) => set("cert_expires_on", e.target.value)} /></Field>
      </div>
      {err && <div className="text-sm text-red">{err}</div>}
      {ok && <div className="text-sm text-teal-ink">{ok}</div>}
      <div className="flex gap-2 justify-end">
        {mode === "edit" && <Btn variant="secondary" onClick={() => setOpen(false)}>Cancel</Btn>}
        <Btn disabled={busy || (mode === "create" && (!f.email || !f.password || !f.full_name))} onClick={submit}>{busy ? "Saving…" : mode === "create" ? "Create login" : "Save"}</Btn>
      </div>
    </div>
  );
}
