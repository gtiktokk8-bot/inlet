"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cancelAppointment, moveAppointment } from "@/app/actions";
import { NewAppointmentForm, localDate, localTime } from "./NewAppointmentForm";
import { Btn, Card, fmtTime } from "./ui";

export type BoardAppt = {
  id: string; client_id: string; staff_id: string; cpt_code: string; starts_at: string; ends_at: string; place_of_service: string;
  client: string; staff: string; session?: { id: string; status: string; note?: string };
};
type Opt = { id: string; name: string };
type StaffOpt = Opt & { role: string };

const DAY_START = 7, DAY_END = 20, PX_PER_HOUR = 52, SNAP_MIN = 15;
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
const GRID_H = (DAY_END - DAY_START) * PX_PER_HOUR;
const POS: Record<string, string> = { "12": "Home", "11": "Clinic", "03": "School", "10": "Telehealth" };

const minsOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const topOf = (iso: string) => ((minsOf(iso) - DAY_START * 60) / 60) * PX_PER_HOUR;

export function ScheduleBoard({ offset, appts, clients, staff, editable }: { offset: number; appts: BoardAppt[]; clients: Opt[]; staff: StaffOpt[]; editable: boolean }) {
  // Week is computed here, in the viewer's time zone (the server runs in UTC).
  const days = useMemo(() => { const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7); return [0, 1, 2, 3, 4, 5].map((i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d.toISOString(); }); }, [offset]);
  const router = useRouter();
  const [items, setItems] = useState(appts);
  useEffect(() => setItems(appts), [appts]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const inWeek = (a: BoardAppt) => { const t = Date.parse(a.starts_at); const s0 = Date.parse(days[0]); return t >= s0 && t < s0 + 7 * 86400e3; };
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; grabOffsetY: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ id: string; col: number; top: number } | null>(null);

  const dayList = useMemo(() => days.map((d) => new Date(d)), [days]);
  const sel = items.find((a) => a.id === selected) ?? null;
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  // Which column/minute a pointer position maps to.
  const locate = (clientX: number, clientY: number, grabOffsetY: number) => {
    const g = gridRef.current!; const r = g.getBoundingClientRect();
    const col = Math.max(0, Math.min(dayList.length - 1, Math.floor(((clientX - r.left) / r.width) * dayList.length)));
    const y = clientY - r.top - grabOffsetY + g.scrollTop;
    let mins = DAY_START * 60 + Math.round(((y / PX_PER_HOUR) * 60) / SNAP_MIN) * SNAP_MIN;
    mins = Math.max(DAY_START * 60, Math.min(DAY_END * 60 - SNAP_MIN, mins));
    return { col, mins, top: ((mins - DAY_START * 60) / 60) * PX_PER_HOUR };
  };

  const onDown = (e: React.PointerEvent, a: BoardAppt) => {
    if (e.button !== 0) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drag.current = { id: a.id, startX: e.clientX, startY: e.clientY, grabOffsetY: e.clientY - r.top, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent, a: BoardAppt) => {
    const d = drag.current; if (!d || d.id !== a.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
    if (!editable || a.session) return;
    d.moved = true;
    const { col, top } = locate(e.clientX, e.clientY, d.grabOffsetY);
    setGhost({ id: a.id, col, top });
  };
  const onUp = async (e: React.PointerEvent, a: BoardAppt) => {
    const d = drag.current; drag.current = null; setGhost(null);
    if (!d || d.id !== a.id) return;
    if (!d.moved) { setSelected((s) => (s === a.id ? null : a.id)); return; }
    const { col, mins } = locate(e.clientX, e.clientY, d.grabOffsetY);
    const day = new Date(dayList[col]); day.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    if (day.toISOString() === a.starts_at) return;
    const dur = Date.parse(a.ends_at) - Date.parse(a.starts_at);
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === a.id ? { ...x, starts_at: day.toISOString(), ends_at: new Date(day.getTime() + dur).toISOString() } : x)));
    setSelected(a.id);
    try { await moveAppointment(a.id, day.toISOString()); flash(`Moved to ${day.toLocaleDateString("en-US", { weekday: "short" })} ${fmtTime(day.toISOString())}`); router.refresh(); }
    catch (err) { setItems(prev); flash((err as Error).message); }
  };

  // Lane layout for overlapping blocks within a day.
  const lanesFor = (list: BoardAppt[]) => {
    const sorted = [...list].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    const laneEnd: number[] = []; const out = new Map<string, { lane: number; lanes: number }>();
    for (const a of sorted) {
      const s = Date.parse(a.starts_at); let lane = laneEnd.findIndex((e) => e <= s);
      if (lane === -1) { lane = laneEnd.length; laneEnd.push(0); }
      laneEnd[lane] = Date.parse(a.ends_at); out.set(a.id, { lane, lanes: 0 });
    }
    for (const v of out.values()) v.lanes = laneEnd.length;
    return out;
  };

  const nowTop = (() => { const n = new Date(); const m = n.getHours() * 60 + n.getMinutes(); return m >= DAY_START * 60 && m <= DAY_END * 60 ? ((m - DAY_START * 60) / 60) * PX_PER_HOUR : null; })();
  const todayStr = new Date().toDateString();

  if (!mounted) return <div className="grid grid-cols-1 xl:grid-cols-4 gap-4"><Card className="xl:col-span-3 min-h-[60vh] animate-pulse">{null}</Card><Card className="h-64 animate-pulse">{null}</Card></div>;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
      <Card className="xl:col-span-3 overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: `44px repeat(${dayList.length}, minmax(0, 1fr))` }}>
          <div className="border-b border-line" />
          {dayList.map((d) => {
            const isToday = d.toDateString() === todayStr;
            return <div key={d.toISOString()} className={`px-2 py-2.5 border-b border-l border-line text-[13px] font-semibold truncate ${isToday ? "text-teal-ink bg-teal-soft/50" : ""}`}>{d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}{isToday ? " · today" : ""}</div>;
          })}
        </div>
        <div className="overflow-y-auto max-h-[70vh]" onPointerDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="grid" style={{ gridTemplateColumns: `44px repeat(${dayList.length}, minmax(0, 1fr))`, height: GRID_H }}>
            <div className="relative select-none">
              {HOURS.map((h) => <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted tabular-nums" style={{ top: (h - DAY_START) * PX_PER_HOUR }}>{h % 12 === 0 ? 12 : h % 12}{h < 12 ? "a" : "p"}</div>)}
            </div>
            <div ref={gridRef} className="relative" style={{ gridColumn: `2 / span ${dayList.length}` }} onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.cell) setSelected(null); }}>
              {HOURS.map((h) => <div key={h} data-cell="1" className="absolute inset-x-0 border-t border-line-soft" style={{ top: (h - DAY_START) * PX_PER_HOUR }} />)}
              <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${dayList.length}, minmax(0, 1fr))` }}>
                {dayList.map((d, i) => <div key={i} className={`border-l border-line ${d.toDateString() === todayStr ? "bg-teal-soft/20" : ""}`} />)}
              </div>
              {nowTop !== null && dayList.some((d) => d.toDateString() === todayStr) && (
                <div className="absolute inset-x-0 pointer-events-none" style={{ top: nowTop }}><div className="border-t-2 border-red opacity-60" /></div>
              )}
              {dayList.map((d, col) => {
                const todays = items.filter((a) => inWeek(a) && new Date(a.starts_at).toDateString() === d.toDateString());
                const lanes = lanesFor(todays);
                return todays.map((a) => {
                  const s = a.session; const note = s?.note;
                  const tone = note === "cosigned" ? "bg-teal-soft border-l-teal" : s?.status === "in_progress" ? "bg-teal-soft border-l-teal ring-1 ring-teal" : s && !note ? "bg-amber-soft border-l-amber" : a.cpt_code !== "97153" ? "bg-line-soft border-l-ink" : "bg-card border border-[#cfcdc6] border-l-teal";
                  const h = Math.max(22, ((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 3600e3) * PX_PER_HOUR - 2);
                  const L = lanes.get(a.id)!; const w = 100 / dayList.length; const laneW = w / L.lanes;
                  const isSel = selected === a.id; const g = ghost?.id === a.id ? ghost : null;
                  const left = g ? g.col * w + 0.3 : col * w + L.lane * laneW + 0.3;
                  const width = g ? w - 0.6 : laneW - 0.6;
                  const top = g ? g.top : topOf(a.starts_at);
                  const canDrag = editable && !s;
                  return (
                    <div key={a.id} role="button" tabIndex={0} aria-selected={isSel} aria-label={`${a.client} ${fmtTime(a.starts_at)}`}
                      onPointerDown={(e) => onDown(e, a)} onPointerMove={(e) => onMove(e, a)} onPointerUp={(e) => onUp(e, a)} onPointerCancel={() => { drag.current = null; setGhost(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(isSel ? null : a.id); } }}
                      className={`absolute px-2 py-1 rounded-lg border-l-[3px] text-[11px] leading-tight overflow-hidden select-none ${tone} ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${g ? "opacity-80 shadow-lg z-20" : isSel ? "z-10 shadow-md" : ""} ${isSel ? "is-selected" : ""}`}
                      style={{ top, height: h, left: `${left}%`, width: `${width}%`, touchAction: "none" }}>
                      <div className="font-bold truncate">{a.client}</div>
                      <div className="text-muted truncate">{fmtTime(a.starts_at)}–{fmtTime(a.ends_at)} · {a.staff.split(" ")[0]}</div>
                      {h > 44 && <div className="text-muted truncate">{a.cpt_code} · {POS[a.place_of_service] ?? a.place_of_service}</div>}
                      {s?.status === "in_progress" && <div className="text-teal-ink font-semibold">In session</div>}
                      {s && s.status === "ended" && !note && <div className="text-amber-ink font-semibold">Note not started</div>}
                      {note && note !== "cosigned" && <div className="text-amber-ink font-semibold">Note {note}</div>}
                      {note === "cosigned" && <div className="text-teal-ink font-semibold">Billed</div>}
                    </div>
                  );
                });
              })}
            </div>
          </div>
        </div>
        {toast && <div className="px-4 py-2 border-t border-line text-sm font-semibold text-teal-ink pop">{toast}</div>}
      </Card>

      <Card className="p-4.5 h-fit xl:sticky xl:top-4">
        {sel ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-bold">{sel.session ? "Appointment" : "Edit appointment"}</div><div className="text-xs text-muted">{new Date(sel.starts_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div></div>
              <button onClick={() => setSelected(null)} aria-label="Close" className="min-h-9 min-w-9 rounded-full border border-[#cfcdc6] text-sm font-bold">✕</button>
            </div>
            {sel.session ? (
              <>
                <div className="text-sm">{sel.client} · {sel.staff}<br />{fmtTime(sel.starts_at)}–{fmtTime(sel.ends_at)} · {sel.cpt_code} · {POS[sel.place_of_service]}</div>
                <div className="text-xs text-muted">This appointment already has a session, so its time and staff are locked here. Fix the clock from the note if it's wrong.</div>
                <div className="flex gap-2 flex-wrap">
                  <Btn href={`/session/${sel.session.id}`} variant="secondary">Open session</Btn>
                  {sel.session.status === "ended" && <Btn href={`/session/${sel.session.id}/note`}>Open note</Btn>}
                </div>
              </>
            ) : editable ? (
              <>
                <div className="text-xs text-muted">Tip: drag the block on the calendar to move it; edit anything else here.</div>
                <NewAppointmentForm key={sel.id + sel.starts_at} clients={clients} staff={staff} appointmentId={sel.id}
                  initial={{ client_id: sel.client_id, staff_id: sel.staff_id, cpt_code: sel.cpt_code, date: localDate(new Date(sel.starts_at)), start: localTime(new Date(sel.starts_at)), end: localTime(new Date(sel.ends_at)), place_of_service: sel.place_of_service }} />
                <Btn variant="danger" onClick={async () => { if (!confirm(`Cancel ${sel.client}'s appointment on ${new Date(sel.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}?`)) return; const id = sel.id; setItems((xs) => xs.filter((x) => x.id !== id)); setSelected(null); try { await cancelAppointment(id); flash("Appointment cancelled"); router.refresh(); } catch (e) { flash((e as Error).message); router.refresh(); } }}>Cancel appointment</Btn>
              </>
            ) : (
              <>
                <div className="text-sm">{sel.client} · {sel.staff}<br />{fmtTime(sel.starts_at)}–{fmtTime(sel.ends_at)} · {sel.cpt_code} · {POS[sel.place_of_service]}</div>
                <Link href="/today" className="text-sm">Start it from My day →</Link>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="font-bold mb-1">Add appointment</div>
            <div className="text-xs text-muted mb-3">Click any block to edit or cancel it. Drag to move it.</div>
            <NewAppointmentForm clients={clients} staff={staff} />
          </>
        )}
      </Card>
    </div>
  );
}
