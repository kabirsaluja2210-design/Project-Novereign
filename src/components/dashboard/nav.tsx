"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@/config/brand";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/create", label: "Create" },
  { href: "/dashboard/projects", label: "Projects" },
  { href: "/dashboard/templates", label: "Templates" },
  { href: "/dashboard/assets", label: "Assets" },
  { href: "/dashboard/characters", label: "Characters" },
  { href: "/dashboard/voices", label: "Voices" },
  { href: "/dashboard/automations", label: "Automations" },
  { href: "/dashboard/publishing", label: "Publishing" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/help", label: "Help" },
];

export function DashboardNav({ role: _role }: { role: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-surface p-4 sm:block">
      <Link href="/" className="mb-6 block px-2 text-base font-semibold">
        {brand.name}
      </Link>
      <nav className="space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? "bg-accent/10 text-accent" : "text-muted hover:bg-bg hover:text-fg"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
