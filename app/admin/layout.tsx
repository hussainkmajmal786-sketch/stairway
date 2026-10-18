import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { requireAdmin } from "@/lib/admin/auth";
import { parseInboxCounts } from "@/lib/community/chat";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

// Soft guard only: a layout does not know the current path and does not re-render on client navigation, so every
// page and server action authorises again with its own scope (see lib/admin/auth.ts). Signed out -> login, and a
// signed-in non-admin gets the 404 page (no role disclosure).
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { ctx, db } = await requireAdmin("/admin");
  // Super admins only; any failure just means no badges.
  let counts = {};
  if (ctx.isSuper) {
    try {
      const { data } = await db.rpc("admin_inbox_counts");
      counts = parseInboxCounts(data);
    } catch {
      counts = {};
    }
  }
  return (
    <DashboardShell variant="admin" isSuper={ctx.isSuper} badges={counts}>
      {children}
    </DashboardShell>
  );
}
