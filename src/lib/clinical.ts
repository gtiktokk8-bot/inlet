import type { SessionEvent, Target } from "./types";

/**
 * Corrections are themselves events (append-only, auditable). This resolves them:
 * a correction replaces the kind/payload of the event it points at, or voids it.
 * Later corrections win. Correction events themselves are not returned.
 */
export function effective(events: SessionEvent[]): SessionEvent[] {
  const fixes = new Map<string, { kind?: string; payload?: Record<string, unknown>; void?: boolean }>();
  for (const e of [...events].sort((a, b) => a.device_seq - b.device_seq)) {
    if (e.kind !== "correction") continue;
    const id = String(e.payload.corrects ?? "");
    const prev = fixes.get(id) ?? {};
    fixes.set(id, { ...prev, ...(e.payload as typeof prev) });
  }
  return events
    .filter((e) => e.kind !== "correction" && !fixes.get(e.id)?.void)
    .map((e) => {
      const f = fixes.get(e.id);
      return f ? { ...e, kind: (f.kind ?? e.kind) as SessionEvent["kind"], payload: f.payload ?? e.payload } : e;
    });
}

export type TrialStats = { n: number; independent: number; prompted: number; incorrect: number; pct: number | null };

export function trialStats(raw: SessionEvent[]): TrialStats {
  const events = effective(raw);
  let independent = 0, prompted = 0, incorrect = 0;
  for (const e of events) {
    if (e.kind === "trial_independent") independent++;
    else if (e.kind === "trial_prompted") prompted++;
    else if (e.kind === "trial_incorrect") incorrect++;
  }
  const n = independent + prompted + incorrect;
  return { n, independent, prompted, incorrect, pct: n ? Math.round((independent / n) * 100) : null };
}

export function countStats(events: SessionEvent[]) {
  return effective(events).filter((e) => e.kind === "count").length;
}

/** Pairs episode_start/episode_end events into durations (seconds). An open episode counts to `now`. */
export function durationStats(events: SessionEvent[], now = Date.now()) {
  const sorted = [...effective(events)].sort((a, b) => a.device_seq - b.device_seq);
  const episodes: { start: string; end: string | null; seconds: number }[] = [];
  let open: string | null = null;
  for (const e of sorted) {
    if (e.kind === "episode_start") open = e.recorded_at;
    if (e.kind === "episode_end" && open) {
      episodes.push({ start: open, end: e.recorded_at, seconds: (Date.parse(e.recorded_at) - Date.parse(open)) / 1000 });
      open = null;
    }
  }
  if (open) episodes.push({ start: open, end: null, seconds: (now - Date.parse(open)) / 1000 });
  const total = episodes.reduce((s, e) => s + e.seconds, 0);
  return { episodes, count: episodes.length, totalSeconds: Math.round(total), running: !!open };
}

/** Task analysis: latest result per step. result 1 = independent, 2 = prompted, 0 = not run */
export function taStats(events: SessionEvent[], steps: string[]) {
  const latest: number[] = steps.map(() => 0);
  for (const e of [...effective(events)].sort((a, b) => a.device_seq - b.device_seq)) {
    if (e.kind !== "ta_step") continue;
    const i = Number(e.payload.step_index);
    const r = Number(e.payload.result);
    if (i >= 0 && i < latest.length) latest[i] = r;
  }
  const independent = latest.filter((x) => x === 1).length;
  return { latest, independent, total: steps.length, pct: steps.length ? Math.round((independent / steps.length) * 100) : null };
}

/** One number to show on a card for any data type. */
export function summarize(target: Target, events: SessionEvent[]) {
  switch (target.data_type) {
    case "trial": {
      const s = trialStats(events);
      return { label: s.pct === null ? "—" : `${s.pct}%`, detail: `${s.n} trials`, value: s.pct };
    }
    case "frequency": {
      const c = countStats(events);
      return { label: String(c), detail: "occurrences", value: c };
    }
    case "duration": {
      const d = durationStats(events);
      return { label: `${d.count} ep`, detail: `${Math.round(d.totalSeconds / 60)} min total`, value: d.count };
    }
    case "task_analysis": {
      const t = taStats(events, target.steps ?? []);
      return { label: `${t.independent}/${t.total} I`, detail: "steps independent", value: t.pct };
    }
  }
}

/** Per-session series for graphing a trial target: [{date, pct, n}] */
export function sessionSeries(events: SessionEvent[], sessionDates: Record<string, string>) {
  const bySession = new Map<string, SessionEvent[]>();
  for (const e of events) {
    if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
    bySession.get(e.session_id)!.push(e);
  }
  return [...bySession.entries()]
    .map(([sid, evs]) => ({ session_id: sid, date: sessionDates[sid] ?? evs[0].recorded_at, ...trialStats(evs) }))
    .filter((p) => p.n > 0)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

/** Mastery: last N sessions all at/above pct with at least min_trials each. */
export function mastered(target: Target, series: { pct: number | null; n: number }[]) {
  const m = target.mastery ?? { pct: 80, sessions: 3, min_trials: 5 };
  if (series.length < m.sessions) return false;
  return series.slice(-m.sessions).every((p) => p.pct !== null && p.pct >= m.pct && p.n >= m.min_trials);
}

export function isStale(lastDataAt: string | null, days = 3) {
  if (!lastDataAt) return true;
  return Date.now() - Date.parse(lastDataAt) > days * 86400000;
}

/** CMS 8-minute rule for 15-minute units (payer-configurable later). */
export function unitsFromMinutes(mins: number) {
  if (mins < 8) return 0;
  return Math.max(1, Math.floor((mins + 7) / 15));
}
