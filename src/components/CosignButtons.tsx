"use client";
import { useState } from "react";
import Link from "next/link";
import { cosignNote, returnNote } from "@/app/actions";

export function CosignButtons({ noteId, sessionId }: { noteId: string; sessionId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex gap-2 items-center">
      <Link href={`/session/${sessionId}/note`} className="min-h-9 px-3 inline-flex items-center rounded-lg border border-[#cfcdc6] bg-card text-xs font-semibold no-underline text-ink">Read</Link>
      <button disabled={busy} onClick={async () => { const r = window.prompt("What needs to change?"); if (!r) return; setBusy(true); await returnNote(noteId, r); setBusy(false); }} className="min-h-9 px-3 rounded-lg border border-[#cfcdc6] bg-card text-xs font-semibold">Send back</button>
      <button disabled={busy} onClick={async () => { setBusy(true); await cosignNote(noteId); setBusy(false); }} className="min-h-9 px-3 rounded-lg bg-teal text-white text-xs font-semibold">Co-sign</button>
    </div>
  );
}
