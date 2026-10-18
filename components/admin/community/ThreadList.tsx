"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { POLL_MS, formatChatTime, type ThreadRow } from "@/lib/community/chat";

/**
 * Inbox of chat threads. Stays fresh via a Realtime subscription on chat_threads (router.refresh, debounced 1 s) with
 * the same 20 s visible-tab poll as the conversation as a backstop; cleaned up on unmount.
 */
export function ThreadList({ rows }: { rows: ThreadRow[] }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!stopped) router.refresh();
      }, 1000);
    };
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (stopped) return;
        if (data.session) supabase.realtime.setAuth(data.session.access_token);
        channel = supabase
          .channel("admin-chat-threads")
          .on("postgres_changes", { event: "*", schema: "public", table: "chat_threads" }, refresh)
          .subscribe();
      } catch {
        // polling below still keeps the list fresh
      }
    })();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (debounce) clearTimeout(debounce);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router]);

  if (rows.length === 0) return <p className="box-2 p-4">No conversations yet.</p>;
  return (
    <ul aria-label="Chat threads" className="border-2 border-ink bg-paper">
      {rows.map((t) => (
        <li key={t.id} className="border-b-2 border-ink last:border-b-0">
          <Link href={`/admin/chat/${t.id}`} className="grid min-h-14 gap-1 p-3 hover:bg-paper-2 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ink sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4">
            <span className="min-w-0 break-words font-semibold">
              {t.full_name} <span className="font-normal text-ink-3">@{t.handle}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-3">{formatChatTime(t.last_message_at)}</span>
              <span className="border-2 border-ink px-2 py-0.5 font-mono text-xs font-bold uppercase">{t.status === "open" ? "Open" : "Closed"}</span>
              {t.blocked && <span className="inline-flex items-center gap-1 border-2 border-ink bg-red px-2 py-0.5 font-mono text-xs font-bold uppercase text-ink"><Ban size={12} aria-hidden /> Blocked</span>}
            </span>
            {t.admin_unread > 0 ? (
              <span className="inline-flex w-fit items-center gap-1 border-2 border-ink bg-yellow px-2 py-0.5 font-mono text-xs font-bold text-ink">
                <MessageCircle size={12} aria-hidden /> {t.admin_unread} unread
              </span>
            ) : <span className="text-sm text-ink-3">Read</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
