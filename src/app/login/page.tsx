"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    if (error) return setError(error.message);
    router.push(params.get("next") || "/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-line rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <div className="text-xl font-bold tracking-tight">ABA Platform</div>
          <div className="text-sm text-muted">Sign in. You stay signed in on this device — no re-login mid-session.</div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input className="min-h-11 px-3 border border-line rounded-[10px]" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input className="min-h-11 px-3 border border-line rounded-[10px]" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="text-sm text-red">{error}</div>}
        <button disabled={busy} className="min-h-12 rounded-[12px] bg-ink text-white font-semibold disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="text-xs text-muted leading-relaxed">
          Demo logins: <b>bcba@demo.aba</b> or <b>rbt@demo.aba</b> · password <b>demo-aba-2026</b>. Demo data is fictional.
        </div>
      </form>
    </div>
  );
}
