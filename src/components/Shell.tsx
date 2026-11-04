import Link from "next/link";
import type { Profile } from "@/lib/types";
import { SignOutButton } from "./SignOutButton";

const nav = [
  { href: "/", label: "Caseload", roles: ["owner", "bcba", "bcaba", "biller"] },
  { href: "/today", label: "My day", roles: ["rbt", "bcba", "bcaba", "owner"] },
  { href: "/clients", label: "Clients", roles: ["owner", "bcba", "bcaba", "rbt", "biller"] },
  { href: "/schedule", label: "Schedule", roles: ["owner", "bcba", "bcaba", "rbt", "biller"] },
  { href: "/notes", label: "Notes to sign", roles: ["owner", "bcba", "bcaba"] },
  { href: "/billing", label: "Billing", roles: ["owner", "bcba", "biller"] },
];

export function Shell({ profile, active, children }: { profile: Profile; active: string; children: React.ReactNode }) {
  const items = nav.filter((n) => n.roles.includes(profile.role));
  return (
    <div className="min-h-screen flex flex-wrap">
      <nav aria-label="Main" className="basis-[220px] grow max-w-[240px] bg-white border-r border-line p-4 flex flex-col gap-1">
        <div className="text-[17px] font-bold tracking-tight px-2.5 pt-1.5 pb-4">ABA Platform</div>
        {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center min-h-10 px-2.5 rounded-[10px] text-sm no-underline ${
              active === n.href ? "bg-teal-soft text-teal font-semibold" : "text-ink font-medium hover:bg-ground"
            }`}
          >
            {n.label}
          </Link>
        ))}
        <div className="grow" />
        <div className="px-2.5 py-3 border-t border-line text-[13px] text-muted">
          <div className="text-ink font-semibold">{profile.full_name}</div>
          <div>{profile.credential ?? profile.role}</div>
          <SignOutButton />
        </div>
      </nav>
      <main className="grow-[999] basis-[560px] min-w-0 p-5 md:p-8 flex flex-col gap-5">{children}</main>
    </div>
  );
}
