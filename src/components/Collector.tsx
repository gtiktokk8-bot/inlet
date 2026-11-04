"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Client, Session, SessionEvent, Target, EventKind } from "@/lib/types";
import { appendEvent, localEvents, sync, pendingCount, saveSessionLocal } from "@/lib/offline";
import { summarize, trialStats, durationStats, taStats, isStale, effective } from "@/lib/clinical";

type T = Target & { program_name: string };

export function Collector({ session, client, targets, initialEvents, lastData }: {
  session: Session; client: Client; targets: T[]; initialEvents: SessionEvent[]; lastData: Record<string, string | null>;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<SessionEvent[]>(initialEvents);
  const [open, setOpen] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>("Gestural");
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(Date.now());
  const seq = useRef(initialEvents.reduce((m, e) => Math.max(m, e.device_seq), 0));

  // Merge anything still on-device (e.g. the page was reloaded offline).
  useEffect(() => {
    localEvents(session.id).then((local) => {
      setEvents((prev) => {
        const ids = new Set(prev.map((e) => e.id));
        const merged = [...prev, ...local.filter((e) => !ids.has(e.id))].sort((a, b) => a.device_seq - b.device_seq);
        seq.current = merged.reduce((m, e) => Math.max(m, e.device_seq), 0);
        return merged;
      });
    });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const on = () => setOnline(true), off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const syncer = setInterval(async () => { const r = await sync(); setPending(await pendingCount()); void r; }, 5000);
    return () => { clearInterval(tick); clearInterval(syncer); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [session.id]);

  const record = useCallback(async (target: T | null, kind: EventKind, payload: Record<string, unknown> = {}) => {
    const e: SessionEvent = {
      id: crypto.randomUUID(), org_id: session.org_id, session_id: session.id, target_id: target?.id ?? null,
      kind, payload, recorded_at: new Date().toISOString(), device_seq: ++seq.current,
    };
    setEvents((prev) => [...prev, e]);           // instant UI
    await appendEvent(e);                          // durable on device
    setPending(await pendingCount());
    sync().then(async () => setPending(await pendingCount())).catch(() => {});
  }, [session.id, session.org_id]);

  /** Fix a previous tap. Appends a correction event; the original stays in the log for audit. */
  const correct = useCallback((target: T, eventId: string, fix: { kind?: EventKind; payload?: Record<string, unknown>; void?: boolean }) => {
    return record(target, "correction", { corrects: eventId, ...fix });
  }, [record]);
  const [editing, setEditing] = useState<string | null>(null);

  const ordered = useMemo(() => {
    const ran = new Set(events.map((e) => e.target_id));
    return [...targets].sort((a, b) => {
      const sa = isStale(lastData[a.id] ?? null) && !ran.has(a.id) ? 0 : 1;
      const sb = isStale(lastData[b.id] ?? null) && !ran.has(b.id) ? 0 : 1;
      return sa - sb || a.sort_order - b.sort_order;
    });
  }, [targets, lastData, events]);

  const elapsed = Math.max(0, now - Date.parse(session.started_at));
  const hh = Math.floor(elapsed / 3600e3), mm = Math.floor((elapsed % 3600e3) / 60e3), ss = Math.floor((elapsed % 60e3) / 1e3);
  const ranCount = new Set(events.filter((e) => e.target_id).map((e) => e.target_id)).size;

  async function endSession() {
    const ended: Session = { ...session, ended_at: new Date().toISOString(), status: "ended" };
    await saveSessionLocal(ended);
    await sync();
    router.push(`/session/${session.id}/note`);
  }

  return (
    <div className="min-h-screen bg-ground flex flex-col max-w-[520px] mx-auto">
      <header className="bg-white border-b border-line px-5 pt-5 pb-3 flex flex-col gap-2.5 sticky top-0 z-10">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-lg font-bold tracking-tight">{client.first_name} {client.last_name} · {session.place_of_service === "12" ? "Home" : "Clinic"}</div>
            <div className="text-[13px] text-muted">{session.cpt_code} · started {new Date(session.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
          </div>
          <div className="text-[26px] font-semibold tabular-nums tracking-tight">{hh}:{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-soft text-teal text-xs font-semibold">✓ Saved on device · {events.length} taps</span>
          {online ? (
            pending > 0 ? <span className="px-2.5 py-1 rounded-full bg-amber-soft text-amber-ink text-xs font-semibold">Syncing {pending}…</span> : <span className="px-2.5 py-1 rounded-full bg-line-soft text-muted text-xs font-semibold">Synced</span>
          ) : <span className="px-2.5 py-1 rounded-full bg-amber-soft text-amber-ink text-xs font-semibold">Offline · {pending} queued</span>}
        </div>
      </header>

      <div className="grow p-4 flex flex-col gap-2.5">
        <div className="flex justify-between items-baseline px-1">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider">Run next · no data in 3+ days first</div>
          <div className="text-xs text-muted">{ranCount}/{targets.length} run</div>
        </div>
        {ordered.map((t) => {
          const evs = events.filter((e) => e.target_id === t.id);
          const sum = summarize(t, evs);
          const isOpen = open === t.id;
          const stale = isStale(lastData[t.id] ?? null) && evs.length === 0;
          return (
            <div key={t.id} className={`bg-white rounded-2xl border ${isOpen ? "border-teal" : "border-line"} overflow-hidden`}>
              <button onClick={() => setOpen(isOpen ? null : t.id)} className="w-full min-h-16 px-3.5 py-3 text-left flex justify-between items-center gap-2.5">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">{t.program_name}</div>
                  <div className="text-xs text-muted">{t.name} · {t.data_type.replace("_", " ")}{stale ? " · no recent data" : ""}</div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className={`font-bold tabular-nums ${sum.value !== null && t.data_type === "trial" && sum.value >= (t.mastery?.pct ?? 80) ? "text-teal" : evs.length ? "text-ink" : "text-[#9aa3b2]"}`}>{sum.label}</div>
                  <span className="text-[#9aa3b2]">›</span>
                </div>
              </button>

              {isOpen && (
                <div className="px-3.5 pb-3.5 pt-2.5 border-t border-line-soft flex flex-col gap-2.5">
                  {t.data_type === "trial" && (() => {
                    const s = trialStats(evs);
                    return (
                      <>
                        {t.sd && <div className="text-xs text-muted">SD: &ldquo;{t.sd}&rdquo; · mastery {t.mastery?.pct ?? 80}% × {t.mastery?.sessions ?? 3}</div>}
                        <div className="grid grid-cols-3 gap-2">
                          <button onClick={() => record(t, "trial_independent")} className="min-h-16 rounded-xl bg-teal text-white font-bold text-[15px]">Independent</button>
                          <button onClick={() => record(t, "trial_prompted", { prompt_level: prompt })} className="min-h-16 rounded-xl bg-white border border-[#cdd2da] font-semibold text-[15px]">Prompted</button>
                          <button onClick={() => record(t, "trial_incorrect")} className="min-h-16 rounded-xl bg-white border border-[#cdd2da] font-semibold text-[15px]">Incorrect</button>
                        </div>
                        <div className="flex gap-1.5 flex-wrap items-center">
                          <span className="text-xs text-muted">Prompt level:</span>
                          {t.prompt_levels.map((p) => (
                            <button key={p} onClick={() => setPrompt(p)} className={`min-h-8 px-2.5 rounded-full border text-xs font-semibold ${prompt === p ? "border-teal bg-teal-soft text-teal" : "border-[#cdd2da] bg-white"}`}>{p}</button>
                          ))}
                        </div>
                        <div className="flex justify-between text-[13px] text-muted"><span>Trials: <b className="text-ink">{s.n}</b></span><span>I {s.independent} · P {s.prompted} · − {s.incorrect}</span></div>
                      </>
                    );
                  })()}

                  {t.data_type === "frequency" && (
                    <div className="grid grid-cols-[1fr_80px] gap-2">
                      <button onClick={() => record(t, "count")} className="min-h-[72px] rounded-xl bg-teal text-white text-[28px] font-bold">+1</button>
                      <button onClick={() => { const last = effective(evs).filter((e) => e.kind === "count").at(-1); if (last) correct(t, last.id, { void: true }); }} aria-label="Undo last count" className="min-h-[72px] rounded-xl bg-white border border-[#cdd2da] text-sm font-semibold">Undo</button>
                    </div>
                  )}

                  {t.data_type === "duration" && (() => {
                    const d = durationStats(evs, now);
                    return (
                      <>
                        <div className="text-xs text-muted">Tap when it starts, tap when it ends. {d.count} episode(s), {Math.round(d.totalSeconds / 60)} min so far.</div>
                        <button onClick={() => record(t, d.running ? "episode_end" : "episode_start")} className={`min-h-[72px] rounded-xl text-white text-lg font-bold ${d.running ? "bg-amber" : "bg-teal"}`}>
                          {d.running ? `Episode running ${Math.floor((d.episodes.at(-1)?.seconds ?? 0) / 60)}:${String(Math.floor((d.episodes.at(-1)?.seconds ?? 0) % 60)).padStart(2, "0")} · tap to end` : "Start episode"}
                        </button>
                      </>
                    );
                  })()}

                  {t.data_type === "task_analysis" && (() => {
                    const ta = taStats(evs, t.steps ?? []);
                    return (
                      <div className="flex flex-col gap-1.5">
                        {(t.steps ?? []).map((label, i) => (
                          <div key={i} className="grid grid-cols-[1fr_44px_44px] gap-1.5 items-center">
                            <div className="text-sm">{label}</div>
                            <button onClick={() => record(t, "ta_step", { step_index: i, result: ta.latest[i] === 1 ? 0 : 1 })} aria-label="Independent" className={`min-h-11 rounded-[10px] border font-bold ${ta.latest[i] === 1 ? "bg-teal border-teal text-white" : "bg-white border-[#cdd2da]"}`}>I</button>
                            <button onClick={() => record(t, "ta_step", { step_index: i, result: ta.latest[i] === 2 ? 0 : 2 })} aria-label="Prompted" className={`min-h-11 rounded-[10px] border font-bold ${ta.latest[i] === 2 ? "bg-amber border-amber text-white" : "bg-white border-[#cdd2da]"}`}>P</button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Recent entries — tap one to correct it. Original taps stay in the log; a correction is appended. */}
                  {(t.data_type === "trial" || t.data_type === "frequency" || t.data_type === "duration") && effective(evs).length > 0 && (
                    <div className="flex flex-col gap-1.5 pt-1 border-t border-line-soft">
                      <div className="flex justify-between items-center pt-2">
                        <div className="text-xs font-semibold text-muted uppercase tracking-wider">Recent entries</div>
                        <div className="text-[11px] text-muted">tap to correct · newest first</div>
                      </div>
                      {effective(evs).slice(-8).reverse().map((e, i, arr) => {
                        const n = effective(evs).length - i;
                        const label = e.kind === "trial_independent" ? "Independent" : e.kind === "trial_prompted" ? `Prompted · ${String(e.payload.prompt_level ?? "")}` : e.kind === "trial_incorrect" ? "Incorrect" : e.kind === "count" ? "+1" : e.kind === "episode_start" ? "Episode start" : "Episode end";
                        const time = new Date(e.recorded_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                        const corrected = evs.some((c) => c.kind === "correction" && c.payload.corrects === e.id);
                        const isEd = editing === e.id;
                        void arr;
                        return (
                          <div key={e.id} className={`rounded-[10px] border ${isEd ? "border-teal" : "border-line-soft"} bg-ground`}>
                            <button onClick={() => setEditing(isEd ? null : e.id)} className="w-full min-h-11 px-3 flex justify-between items-center text-[13px]">
                              <span><span className="text-muted tabular-nums mr-2">#{n}</span><b>{label}</b>{corrected && <span className="ml-2 text-[11px] text-amber-ink font-semibold">edited</span>}</span>
                              <span className="text-muted text-xs">{time}</span>
                            </button>
                            {isEd && (
                              <div className="px-2.5 pb-2.5 flex gap-1.5 flex-wrap">
                                {t.data_type === "trial" && (["trial_independent", "trial_prompted", "trial_incorrect"] as EventKind[]).map((k) => (
                                  <button key={k} disabled={k === e.kind} onClick={() => { correct(t, e.id, { kind: k, payload: k === "trial_prompted" ? { prompt_level: prompt } : {} }); setEditing(null); }} className={`min-h-9 px-3 rounded-full border text-xs font-semibold disabled:opacity-40 ${k === "trial_independent" ? "bg-teal text-white border-teal" : "bg-white border-[#cdd2da]"}`}>
                                    {k === "trial_independent" ? "Independent" : k === "trial_prompted" ? `Prompted (${prompt})` : "Incorrect"}
                                  </button>
                                ))}
                                <button onClick={() => { correct(t, e.id, { void: true }); setEditing(null); }} className="min-h-9 px-3 rounded-full border border-[#f5c2c2] bg-red-soft text-red text-xs font-semibold">Remove</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <footer className="sticky bottom-0 bg-white border-t border-line p-4 pb-7 flex gap-2.5">
        <button onClick={() => { const text = window.prompt("Quick note (saved to the session, goes into the note draft):"); if (text) record(null, "note", { text }); }} className="min-h-[52px] px-4 rounded-[14px] border border-[#cdd2da] bg-white text-sm font-semibold">Quick note</button>
        <button onClick={endSession} className="grow min-h-[52px] rounded-[14px] bg-ink text-white text-[15px] font-bold">End session · draft note →</button>
      </footer>
    </div>
  );
}
