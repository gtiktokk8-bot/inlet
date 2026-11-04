"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientRecord } from "@/app/actions";
import { Card, Field, inputCls, Btn } from "./ui";
import { CPT_LABEL } from "@/lib/types";

export function NewClientForm({ payers }: { payers: { id: string; name: string; type: string }[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    first_name: "", last_name: "", dob: "", diagnosis_code: "F84.0", member_id: "",
    payer_id: payers[0]?.id ?? "", new_payer_name: "", new_payer_type: "commercial",
    guardian_name: "", guardian_relation: "Mother", guardian_phone: "", guardian_email: "",
    auth_cpt: "97153", auth_units: "", auth_start: "", auth_end: "", auth_number: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const steps = ["Client", "Guardian & payer", "Authorization"];
  const can0 = f.first_name && f.last_name && f.dob;
  const selectedPayer = payers.find((p) => p.id === f.payer_id);
  const privatePay = selectedPayer?.type === "private_pay" || (f.payer_id === "" && f.new_payer_type === "private_pay");

  async function submit() {
    setBusy(true); setErr(null);
    try { const id = await createClientRecord(f); router.push(`/clients/${id}`); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="max-w-xl flex flex-col gap-4">
      <div className="flex gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex-1 flex flex-col gap-1.5">
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-teal" : "bg-line-soft"}`} />
            <div className={`text-xs ${i === step ? "text-ink font-semibold" : "text-muted"}`}>{i + 1}. {s}</div>
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card className="p-5 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><input className={inputCls} value={f.first_name} onChange={(e) => set("first_name", e.target.value)} autoFocus /></Field>
            <Field label="Last name"><input className={inputCls} value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of birth"><input type="date" className={inputCls} value={f.dob} onChange={(e) => set("dob", e.target.value)} /></Field>
            <Field label="Diagnosis code" hint="F84.0 = autism spectrum disorder"><input className={inputCls} value={f.diagnosis_code} onChange={(e) => set("diagnosis_code", e.target.value)} /></Field>
          </div>
          <div className="flex justify-end"><Btn disabled={!can0} onClick={() => setStep(1)}>Next · guardian & payer</Btn></div>
        </Card>
      )}

      {step === 1 && (
        <Card className="p-5 flex flex-col gap-3">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider">Guardian</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input className={inputCls} value={f.guardian_name} onChange={(e) => set("guardian_name", e.target.value)} /></Field>
            <Field label="Relation"><input className={inputCls} value={f.guardian_relation} onChange={(e) => set("guardian_relation", e.target.value)} /></Field>
            <Field label="Phone"><input className={inputCls} value={f.guardian_phone} onChange={(e) => set("guardian_phone", e.target.value)} /></Field>
            <Field label="Email"><input className={inputCls} value={f.guardian_email} onChange={(e) => set("guardian_email", e.target.value)} /></Field>
          </div>
          <div className="text-xs font-semibold text-muted uppercase tracking-wider mt-2">Payer</div>
          <Field label="Who pays">
            <select className={inputCls} value={f.payer_id} onChange={(e) => set("payer_id", e.target.value)}>
              {payers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type.replace("_", " ")})</option>)}
              <option value="">+ Add a new payer…</option>
            </select>
          </Field>
          {f.payer_id === "" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payer name"><input className={inputCls} value={f.new_payer_name} onChange={(e) => set("new_payer_name", e.target.value)} placeholder="e.g. Aetna" /></Field>
              <Field label="Type">
                <select className={inputCls} value={f.new_payer_type} onChange={(e) => set("new_payer_type", e.target.value)}>
                  <option value="commercial">Commercial insurance</option><option value="private_pay">Private pay</option><option value="medicaid">Medicaid</option>
                </select>
              </Field>
            </div>
          )}
          {!privatePay && <Field label="Member ID"><input className={inputCls} value={f.member_id} onChange={(e) => set("member_id", e.target.value)} /></Field>}
          <div className="flex justify-between"><Btn variant="secondary" onClick={() => setStep(0)}>Back</Btn><Btn onClick={() => setStep(2)}>Next · authorization</Btn></div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-5 flex flex-col gap-3">
          {privatePay ? (
            <div className="text-sm text-muted">Private pay — no authorization needed. Sessions will be invoiced instead of claimed.</div>
          ) : (
            <>
              <div className="text-sm text-muted">Enter the first authorization now so the schedule can check against it. Skip if you don&rsquo;t have it yet.</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Service">
                  <select className={inputCls} value={f.auth_cpt} onChange={(e) => set("auth_cpt", e.target.value)}>
                    {["97153", "97155", "97156", "97151"].map((c) => <option key={c} value={c}>{c} · {CPT_LABEL[c]}</option>)}
                  </select>
                </Field>
                <Field label="Units authorized" hint="15-minute units"><input type="number" className={inputCls} value={f.auth_units} onChange={(e) => set("auth_units", e.target.value)} /></Field>
                <Field label="Start"><input type="date" className={inputCls} value={f.auth_start} onChange={(e) => set("auth_start", e.target.value)} /></Field>
                <Field label="End"><input type="date" className={inputCls} value={f.auth_end} onChange={(e) => set("auth_end", e.target.value)} /></Field>
                <Field label="Auth number"><input className={inputCls} value={f.auth_number} onChange={(e) => set("auth_number", e.target.value)} /></Field>
              </div>
            </>
          )}
          {err && <div className="text-sm text-red">{err}</div>}
          <div className="flex justify-between"><Btn variant="secondary" onClick={() => setStep(1)}>Back</Btn><Btn variant="teal" disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create client"}</Btn></div>
        </Card>
      )}
    </div>
  );
}
