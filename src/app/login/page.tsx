"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
    router.push(params.get("next") || "/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Logo size={28} />
          <div className="text-[15px] text-muted leading-snug">Notes. Data. Done. — ABA practice software built for the session.</div>
        </div>
        <form onSubmit={submit} className="bg-card border border-line rounded-2xl p-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email
            <input className="min-h-11 px-3 border border-line rounded-[10px] font-normal" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Password
            <input className="min-h-11 px-3 border border-line rounded-[10px] font-normal" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <div className="text-sm text-red">{error}</div>}
          <button disabled={busy} className="min-h-12 rounded-[12px] bg-ink text-white font-semibold disabled:opacity-60">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="text-xs text-muted">You stay signed in on this device. No re-login mid-session.</div>
        </form>
        <div className="text-xs text-muted leading-relaxed">
          Demo: <b>bcba@demo.aba</b> or <b>rbt@demo.aba</b> · password <b>demo-aba-2026</b>. All demo data is fictional.
        </div>
      </div>
    </div>
  );
}
