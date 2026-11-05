import Link from "next/link";
import type { Profile } from "@/lib/types";
import { SignOutButton } from "./SignOutButton";
import { Logo } from "./Logo";

const nav = [
  { href: "/", label: "Home", short: "Home", roles: ["owner", "bcba", "bcaba", "biller"] },
  { href: "/today", label: "My day", short: "My day", roles: ["rbt", "bcba", "bcaba", "owner"] },
  { href: "/clients", label: "Clients", short: "Clients", roles: ["owner", "bcba", "bcaba", "rbt", "biller"] },
  { href: "/schedule", label: "Schedule", short: "Schedule", roles: ["owner", "bcba", "bcaba", "rbt", "biller"] },
  { href: "/notes", label: "Notes to sign", short: "Notes", roles: ["owner", "bcba", "bcaba"] },
  { href: "/authorizations", label: "Authorizations", short: "Auths", roles: ["owner", "bcba", "bcaba", "biller"] },
  { href: "/billing", label: "Billing", short: "Billing", roles: ["owner", "bcba", "biller"] },
  { href: "/team", label: "Team", short: "Team", roles: ["owner", "bcba"] },
  { href: "/settings", label: "Settings", short: "Settings", roles: ["owner"] },
  { href: "/profile", label: "My profile", short: "Me", roles: ["owner", "bcba", "bcaba", "rbt", "biller"] },
];

export function Shell({ profile, active, children }: { profile: Profile; active: string; children: React.ReactNode }) {
  const items = nav.filter((n) => n.roles.includes(profile.role));
  const mobile = items.slice(0, 5);
  return (
    <div className="min-h-screen md:flex">
      {/* Desktop side nav */}
      <nav aria-label="Main" className="hidden md:flex md:w-[232px] md:shrink-0 bg-card border-r border-line p-4 flex-col gap-1 sticky top-0 h-screen">
        <div className="px-2.5 pt-1.5 pb-5"><Logo /></div>
        {items.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active === n.href ? "page" : undefined} className={`flex items-center min-h-10 px-2.5 rounded-[10px] text-sm no-underline pressable border border-transparent ${active === n.href ? "bg-teal-soft text-teal-ink font-semibold" : "text-ink font-medium hover:bg-ground"}`}>
            {n.label}
          </Link>
        ))}
        <div className="grow" />
        <div className="px-2.5 py-3 border-t border-line text-[13px] text-muted">
          <Link href="/profile" className="text-ink font-semibold no-underline hover:underline">{profile.full_name}</Link>
          <div>{profile.credential ?? profile.role}</div>
          <SignOutButton />
        </div>
      </nav>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-20 bg-card border-b border-line px-4 py-3 flex justify-between items-center">
        <Logo size={20} />
        <Link href="/profile" className="text-xs text-muted no-underline">{profile.full_name.split(" ")[0]} · {profile.credential ?? profile.role}</Link>
      </div>

      <main className="grow min-w-0 p-4 pb-24 md:p-8 md:pb-8 flex flex-col gap-5">{children}</main>

      {/* Mobile bottom tabs — thumbs, not menus */}
      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-card border-t border-line grid pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `repeat(${mobile.length}, minmax(0, 1fr))` }}>
        {mobile.map((n) => (
          <Link key={n.href} href={n.href} className={`flex flex-col items-center justify-center min-h-14 text-[11px] font-semibold no-underline ${active === n.href ? "text-teal-ink" : "text-muted"}`}>
            <span className={`w-6 h-1 rounded-full mb-1.5 ${active === n.href ? "bg-teal" : "bg-transparent"}`} />
            {n.short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
