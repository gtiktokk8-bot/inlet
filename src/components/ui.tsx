import Link from "next/link";

export function PageTitle({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[24px] md:text-[26px] font-bold tracking-tight">{title}</h1>
        {sub && <div className="text-sm text-muted">{sub}</div>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`bg-card border border-line rounded-[14px] ${className}`}>
      {children}
    </section>
  );
}

export function Stat({ label, value, note, tone = "ink", href }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "ink" | "teal" | "amber" | "red"; href?: string }) {
  const toneCls = { ink: "", teal: "text-teal-ink", amber: "text-amber-ink", red: "text-red" }[tone];
  const bg = tone === "amber" ? "bg-amber-soft border-[#f0d9b0]" : tone === "red" ? "bg-red-soft border-[#f3c3bf]" : "bg-card border-line";
  const inner = (
    <div className={`border rounded-[14px] p-4 flex flex-col gap-1 h-full ${bg}`}>
      <div className={`text-xs font-semibold ${tone === "ink" || tone === "teal" ? "text-muted" : toneCls}`}>{label}</div>
      <div className={`text-3xl font-bold tracking-tight ${toneCls}`}>{value}</div>
      {note && <div className={`text-xs ${tone === "ink" || tone === "teal" ? "text-muted" : toneCls}`}>{note}</div>}
    </div>
  );
  return href ? <Link href={href} className="no-underline text-ink">{inner}</Link> : inner;
}

export function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "teal" | "amber" | "red" }) {
  const cls = {
    gray: "bg-line-soft text-ink",
    teal: "bg-teal-soft text-teal-ink",
    amber: "bg-amber-soft text-amber-ink",
    red: "bg-red-soft text-red",
  }[tone];
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>;
}

export function Btn({ href, children, variant = "primary", type, onClick, disabled, className = "" }: {
  href?: string; children: React.ReactNode; variant?: "primary" | "secondary" | "teal" | "danger"; type?: "submit" | "button"; onClick?: () => void; disabled?: boolean; className?: string;
}) {
  const base = "inline-flex items-center justify-center min-h-10 px-3.5 rounded-[10px] text-sm font-semibold no-underline disabled:opacity-50";
  const v = { primary: "bg-ink text-white", secondary: "bg-card border border-[#cfcdc6] text-ink", teal: "bg-teal text-white", danger: "bg-card border border-[#f3c3bf] text-red" }[variant];
  if (href) return <Link href={href} className={`${base} ${v} ${className}`}>{children}</Link>;
  return <button type={type ?? "button"} onClick={onClick} disabled={disabled} className={`${base} ${v} ${className}`}>{children}</button>;
}

/** Goal-gradient progress bar: the closer to done, the more it wants to be finished. */
export function Progress({ value, max, label, tone = "teal" }: { value: number; max: number; label?: string; tone?: "teal" | "gold" | "red" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill = tone === "gold" ? "bg-gold" : tone === "red" ? "bg-red" : "bg-teal";
  return (
    <div className="flex flex-col gap-1">
      {label && <div className="flex justify-between text-xs text-muted"><span>{label}</span><span className="tabular-nums">{value}/{max}</span></div>}
      <div className="bar h-2 rounded-full bg-line-soft overflow-hidden"><span className={`block h-full ${fill}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="p-8 text-center flex flex-col items-center gap-2">
      <div className="font-semibold">{title}</div>
      {body && <div className="text-sm text-muted max-w-sm">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
      {hint && <span className="text-xs text-muted font-normal">{hint}</span>}
    </label>
  );
}
export const inputCls = "min-h-10 px-3 border border-[#cfcdc6] rounded-[10px] bg-card font-normal text-sm";

export function initials(c: { first_name: string; last_name: string }) {
  return `${c.first_name[0] ?? ""}.${c.last_name[0] ?? ""}.`;
}
export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
/** "14h left" / "overdue 3h" — deadlines as time, not dates. */
export function hoursLeft(deadlineIso: string) {
  const h = Math.round((Date.parse(deadlineIso) - Date.now()) / 3600e3);
  return h >= 0 ? `${h}h left` : `overdue ${-h}h`;
}
