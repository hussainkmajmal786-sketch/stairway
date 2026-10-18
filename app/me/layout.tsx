import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { hasSupabaseSessionCookie } from "@/lib/auth/cookies";
import { parseChatState } from "@/lib/community/chat";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your dashboard", robots: { index: false } };

// No auth guard here on purpose: layouts don't know the current path (so a guard here would
// send everyone back to /me after login) and don't re-render on client navigation. Every
// /me page calls requireOnboarded() with its own path instead. The shell renders no user data except the
// unread-chat count, fetched only for a signed-in visitor (any failure just means no badge).
export default async function MeLayout({ children }: LayoutProps<"/me">) {
  let badges: Partial<Record<string, number>> = {};
  try {
    const store = await cookies();
    if (hasSupabaseSessionCookie(store.getAll().map((c) => c.name))) {
      const db = await createClient();
      const { data: claims } = await db.auth.getClaims();
      if (claims?.claims?.sub) {
        const { data } = await db.rpc("chat_state");
        badges = { "/me/chat": parseChatState(data).userUnread };
      }
    }
  } catch {
    badges = {};
  }
  return <DashboardShell variant="me" badges={badges}>{children}</DashboardShell>;
}
