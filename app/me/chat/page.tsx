import type { Metadata } from "next";
import { AccessNotice } from "@/components/chat/AccessNotice";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { requireOnboarded } from "@/lib/auth/session";
import { accessCopy, parseChatState, type ChatMessage } from "@/lib/community/chat";
import { USER_COLS, toMessage } from "@/lib/community/chat-thread";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chat", robots: { index: false, follow: false } };

const LOAD = 100;

export default async function MeChatPage() {
  // The /me layout has no guard (it cannot see the path), so every /me page guards itself.
  await requireOnboarded("/me/chat");
  const db = await createClient();
  const { data, error } = await db.rpc("chat_state");
  const state = parseChatState(data);

  let initial: ChatMessage[] = [];
  if ((state.access === "member" || state.access === "attendee") && state.threadId) {
    // Safe columns only: users never request flagged_at / sender_id.
    const { data: msgs } = await db.from("chat_messages").select(USER_COLS).eq("thread_id", state.threadId).order("id", { ascending: false }).limit(LOAD);
    initial = (msgs ?? []).map((m) => toMessage(m, "user")).filter((m): m is ChatMessage => m !== null).reverse();
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-semibold md:text-4xl">Chat with the team</h1>
      {error ? (
        <div role="alert" className="box-2 p-5">
          <p className="font-semibold">We could not load chat right now.</p>
          <a href="/me/chat" className="btn btn-sm btn-secondary mt-4">Try again</a>
        </div>
      ) : state.access === "member" || state.access === "attendee" ? (
        <>
          <p className="box-2 p-3" role="note">{accessCopy(state.access, state.accessUntil)}</p>
          <ChatPanel key={state.threadId ?? "new"} threadId={state.threadId} initial={initial} viewer="user" initialThreadStatus={state.status} />
        </>
      ) : (
        <AccessNotice access={state.access} />
      )}
    </div>
  );
}
