"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm bg-card border border-line rounded-2xl p-6 flex flex-col gap-3">
        <div className="font-bold">Something went wrong on this screen.</div>
        <div className="text-sm text-muted">Your session data is safe — anything collected is saved on this device and syncs when you reopen it.</div>
        {error.digest && <div className="text-xs text-muted">Ref {error.digest}</div>}
        <button onClick={reset} className="min-h-11 rounded-xl bg-ink text-white font-semibold">Try again</button>
      </div>
    </div>
  );
}
