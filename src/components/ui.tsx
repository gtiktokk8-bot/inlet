import Link from "next/link";

export function PageTitle({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
        {sub && <div className="text-sm text-muted">{sub}</div>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`bg-white border border-line rounded-[14px] ${className}`}>
      {children}
    </section>
  );
}

export function Stat({ label, value, note, tone = "ink" }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "ink" | "teal" | "amber" | "red" }) {
  const toneCls = { ink: "", teal: "text-teal", amber: "text-amber-ink", red: "text-red" }[tone];
  const bg = tone === "amber" ? "bg-amber-soft border-[#f3d9b1]" : tone === "red" ? "bg-red-soft border-[#f5c2c2]" : "bg-white border-line";
  return (
    <div className={`border rounded-[14px] p-4 flex flex-col gap-1 ${bg}`}>
      <div className={`text-xs font-semibold ${tone === "ink" || tone === "teal" ? "text-muted" : toneCls}`}>{label}</div>
      <div className={`text-3xl font-bold tracking-tight ${toneCls}`}>{value}</div>
      {note && <div className={`text-xs ${tone === "ink" || tone === "teal" ? "text-muted" : toneCls}`}>{note}</div>}
    </div>
  );
}

export function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "teal" | "amber" | "red" }) {
  const cls = {
    gray: "bg-line-soft text-ink",
    teal: "bg-teal-soft text-teal",
    amber: "bg-amber-soft text-amber-ink",
    red: "bg-red-soft text-red",
  }[tone];
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>;
}

export function Btn({ href, children, variant = "primary", type, onClick, disabled, className = "" }: {
  href?: string; children: React.ReactNode; variant?: "primary" | "secondary" | "teal"; type?: "submit" | "button"; onClick?: () => void; disabled?: boolean; className?: string;
}) {
  const base = "inline-flex items-center justify-center min-h-10 px-3.5 rounded-[10px] text-sm font-semibold no-underline disabled:opacity-50";
  const v = { primary: "bg-ink text-white", secondary: "bg-white border border-[#cdd2da] text-ink", teal: "bg-teal text-white" }[variant];
  if (href) return <Link href={href} className={`${base} ${v} ${className}`}>{children}</Link>;
  return <button type={type ?? "button"} onClick={onClick} disabled={disabled} className={`${base} ${v} ${className}`}>{children}</button>;
}

export function initials(c: { first_name: string; last_name: string }) {
  return `${c.first_name[0] ?? ""}.${c.last_name[0] ?? ""}.`;
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
