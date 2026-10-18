import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ThreadActions } from "@/components/admin/community/ThreadActions";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { requireAdmin } from "@/lib/admin/auth";
import { ADMIN_COLS, toMessage } from "@/lib/community/chat-thread";
import type { ChatMessage } from "@/lib/community/chat";
import { z } from "zod";
import { parseThreads } from "@/lib/community/chat";
import type { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conversation", robots: { index: false, follow: false } };

const LOAD = 200;

type Db = Awaited<ReturnType<typeof createClient>>;
/** Finds one thread's list row (the RPC returns at most 50 per page); bounded to 10 pages. */
async function findThreadRow(db: Db, id: string) {
  for (let page = 0; page < 10; page++) {
    const { data } = await db.rpc("admin_chat_threads", { p_status: "all", p_limit: 50, p_offset: page * 50 });
    const { total, rows } = parseThreads(data);
    const hit = rows.find((r) => r.id === id);
    if (hit) return hit;
    if ((page + 1) * 50 >= total) break;
  }
  return null;
}

export default async function AdminThreadPage({ params }: PageProps<"/admin/chat/[threadId]">) {
  const { threadId } = await params;
  // Super admin only (404 for everyone else, login for signed-out). A malformed id is the same 404 as a missing thread.
  const { db } = await requireAdmin(`/admin/chat/${encodeURIComponent(threadId)}`, { kind: "super" });
  if (!z.uuid().safeParse(threadId).success) notFound();

  const { data: t } = await db.from("chat_threads").select("id, user_id, status").eq("id", threadId).maybeSingle();
  if (!t) notFound();
  const [{ data: profile }, row, { data: msgs }] = await Promise.all([
    db.from("profiles").select("handle, full_name").eq("id", t.user_id).maybeSingle(),
    // chat_blocks is not readable by any API role, so the blocked flag comes from the thread-list RPC.
    findThreadRow(db, threadId),
    // newest 200, shown oldest first
    db.from("chat_messages").select(ADMIN_COLS).eq("thread_id", threadId).order("id", { ascending: false }).limit(LOAD),
  ]);
  const initial = (msgs ?? [])
    .map((m) => toMessage(m, "admin"))
    .filter((m): m is ChatMessage => m !== null)
    .reverse();
  const status = t.status === "closed" ? "closed" : "open";

  return (
    <div className="grid gap-6">
      <Link href="/admin/chat" className="btn btn-sm btn-secondary w-fit min-h-11"><ArrowLeft size={16} aria-hidden /> All conversations</Link>
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold md:text-4xl">{profile?.full_name ?? "Member"}</h1>
        <p className="text-ink-2">
          {profile ? `@${profile.handle} · ` : ""}{status === "open" ? "Open" : "Closed"}{row?.blocked ? " · Blocked from chat" : ""}
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <ChatPanel key={threadId} threadId={threadId} initial={initial} viewer="admin" initialThreadStatus={status} />
        <aside aria-label="Thread actions" className="box grid gap-4 p-4 shadow-hard">
          <h2 className="mono font-bold">Actions</h2>
          <ThreadActions threadId={threadId} userId={t.user_id} status={status} blocked={!!row?.blocked} />
        </aside>
      </div>
    </div>
  );
}
