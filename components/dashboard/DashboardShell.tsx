"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LayoutDashboard, LogOut, Settings, Ticket, UserRound, type LucideIcon } from "lucide-react";
import { FieldBand } from "@/components/ui/Poster";
import { isNavActive } from "@/lib/dashboard/nav";
import { cn } from "@/lib/utils";

interface NavItem { href: string; label: string; Icon: LucideIcon; exact?: boolean }

// Nav config lives here (client side) so no component references cross the server/client boundary.
const NAV = {
  me: {
    title: "Your dashboard",
    items: [
      { href: "/me", label: "Overview", Icon: LayoutDashboard, exact: true },
      // Not exact: a single ticket (/me/tickets/<id>) keeps "My tickets" active.
      { href: "/me/tickets", label: "My tickets", Icon: Ticket },
      { href: "/me/profile", label: "Profile", Icon: UserRound },
      { href: "/me/settings", label: "Settings", Icon: Settings },
    ],
  },
} satisfies Record<string, { title: string; items: NavItem[] }>;

export type DashboardVariant = keyof typeof NAV;

const itemCls =
  "flex h-12 shrink-0 items-center gap-2 border-2 border-ink px-4 font-mono text-xs font-bold uppercase tracking-[0.12em] transition-colors";

/**
 * Dashboard layout: cobalt chrome around a cream sidebar panel and a cream work panel (dense tables and forms never
 * sit on the field). The first control in the sidebar always closes the dashboard (back to the site home).
 */
export function DashboardShell({ variant, children }: { variant: DashboardVariant; children: React.ReactNode }) {
  const pathname = usePathname();
  const { title, items } = NAV[variant];

  return (
    <FieldBand as="div" ghost={false} className="border-b-2 border-ink">
      <div className="wrap grid gap-6 py-8 md:py-12 lg:grid-cols-[240px_1fr] lg:gap-10">
        {/* min-w-0: the tab strip scrolls inside the panel instead of widening the grid track past the viewport.
            top-32 clears the sticky header even with the announcement strip open (~115px), so Back to site is never covered. */}
        <aside className="panel min-w-0 p-3.5 lg:sticky lg:top-32 lg:self-start">
          <Link href="/" className="btn btn-sm btn-secondary mb-4 w-full justify-start shadow-[3px_3px_0_0_var(--ink)] lg:mb-5">
            <ArrowLeft size={16} strokeWidth={2} aria-hidden /> Back to site
          </Link>
          <div className="side-strip mb-3 hidden lg:block" aria-hidden="true" />
          <p className="mono mb-3 hidden font-bold text-ink-3 lg:block">{title}</p>
          {/* -m-1.5 p-1.5: the scrolling strip clips at its padding box, so leave room for the 3px ring + 3px offset */}
          <nav aria-label={title} className="no-scrollbar -m-1.5 flex gap-2 overflow-x-auto p-1.5 lg:flex-col lg:overflow-visible">
            {items.map(({ href, label, Icon, exact }) => {
              const active = isNavActive(pathname, href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(itemCls, active ? "bg-yellow shadow-[3px_3px_0_0_var(--ink)]" : "bg-paper hover:bg-paper-3")}
                >
                  <Icon size={16} strokeWidth={2} aria-hidden /> {label}
                </Link>
              );
            })}
            <form action="/auth/signout" method="post" className="shrink-0 lg:mt-4">
              <button type="submit" className={cn(itemCls, "bg-paper hover:bg-red lg:w-full")}>
                <LogOut size={16} strokeWidth={2} aria-hidden /> Sign out
              </button>
            </form>
          </nav>
        </aside>
        <div className="panel min-w-0 p-5 md:p-8">{children}</div>
      </div>
    </FieldBand>
  );
}
