"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateMyProfile, changePassword } from "@/app/actions";
import { Field, inputCls, Btn } from "./ui";

export function ProfileForm({ initial }: { initial: { full_name: string; credential: string; npi: string; cert_expires_on: string } }) {
  const router = useRouter();
  const [f, setF] = useState(initial); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const run = async (label: string, fn: () => Promise<void>, ok: string) => { setBusy(label); setMsg(null); try { await fn(); setMsg({ ok: true, text: ok }); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(null); };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Field label="Full name"><input className={inputCls} value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Credential" hint="RBT, BCaBA, BCBA…"><input className={inputCls} value={f.credential} onChange={(e) => set("credential", e.target.value)} /></Field>
          <Field label="NPI"><input className={inputCls} value={f.npi} onChange={(e) => set("npi", e.target.value)} /></Field>
        </div>
        <Field label="Certification renews on" hint="You'll get a nudge 45 days before."><input type="date" className={inputCls} value={f.cert_expires_on} onChange={(e) => set("cert_expires_on", e.target.value)} /></Field>
        <Btn disabled={busy !== null || !f.full_name.trim()} onClick={() => run("profile", () => updateMyProfile(f), "Profile saved")}>{busy === "profile" ? "Saving…" : "Save profile"}</Btn>
      </div>
      <div className="flex flex-col gap-3 pt-4 border-t border-line">
        <div className="font-bold">Change password</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="New password"><input type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Repeat it"><input type="password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
        </div>
        <Btn variant="secondary" disabled={busy !== null || pw.length < 10 || pw !== pw2} onClick={() => run("pw", async () => { await changePassword(pw); setPw(""); setPw2(""); }, "Password changed")}>{busy === "pw" ? "Changing…" : pw && pw.length < 10 ? "At least 10 characters" : pw && pw !== pw2 ? "Passwords don't match" : "Change password"}</Btn>
      </div>
      {msg && <div className={`text-sm font-semibold ${msg.ok ? "text-teal-ink pop" : "text-red"}`}>{msg.text}</div>}
    </div>
  );
}
