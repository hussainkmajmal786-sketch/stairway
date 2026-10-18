"use client";

import { useEffect, useState, useTransition } from "react";
import { Radio, RefreshCw, WifiOff } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Composer } from "./Composer";
import { FlagButton, MessageList } from "./MessageList";
import { AccessNotice } from "./AccessNotice";
import { useChatThread, type ChatStatus } from "./useChatThread";
import { flagMessage } from "@/lib/community/chat-actions";
import { POLL_MS, type ChatMessage } from "@/lib/community/chat";

const STATUS: Record<ChatStatus, { text: string; Icon: typeof Radio }> = {
  live: { text: "Live", Icon: Radio },
  polling: { text: `Updating every ${POLL_MS / 1000} s`, Icon: RefreshCw },
  offline: { text: "Offline, retrying", Icon: WifiOff },
};

/**
 * Cream bordered conversation panel shared by /me/chat and /admin/chat/[threadId]. Mount with `key={threadId}`.
 * The state chip is icon + words, so it never relies on colour.
 */
export function ChatPanel({
  threadId,
  initial,
  viewer,
  initialThreadStatus,
}: {
  threadId: string | null;
  initial: ChatMessage[];
  viewer: "user" | "admin";
  initialThreadStatus: "open" | "closed" | null;
}) {
  const t = useChatThread({ threadId, initial, viewer });
  const { markRead, messages } = t;
  const [flagTarget, setFlagTarget] = useState<number | null>(null);
  const [flagged, setFlagged] = useState<ReadonlySet<number>>(new Set());
  const [flagError, setFlagError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    markRead();
  }, [messages, markRead]);
  useEffect(() => {
    const onVisible = () => markRead();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  const lapsed = viewer === "user" && (t.access === "none" || t.access === "blocked");
  if (lapsed) return <AccessNotice access={t.access === "blocked" ? "blocked" : "ended"} />;

  const closed = (t.threadStatus ?? initialThreadStatus) === "closed";
  const { text, Icon } = STATUS[t.status];

  function confirmFlag() {
    if (flagTarget === null) return;
    const id = flagTarget;
    setFlagError(null);
    start(async () => {
      const r = await flagMessage(id);
      if (r.ok) {
        setFlagged((p) => new Set(p).add(id));
        setFlagTarget(null);
      } else setFlagError(r.error.message);
    });
  }

  return (
    <section aria-label="Chat" className="box grid gap-4 p-4 shadow-hard md:p-6">
      <p className="inline-flex w-fit items-center gap-2 border-2 border-ink bg-paper-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.1em]">
        <Icon size={14} aria-hidden className={t.status === "polling" ? "motion-safe:animate-none" : ""} /> {text}
      </p>
      <MessageList
        messages={messages}
        viewer={viewer}
        flaggedIds={flagged}
        renderAction={viewer === "admin" ? (m) => <FlagButton onClick={() => { setFlagError(null); setFlagTarget(m.id); }} /> : undefined}
      />
      {closed && (
        <p role="status" className="border-2 border-ink bg-paper-2 p-3">
          {viewer === "user"
            ? "The team closed this conversation — send a message to reopen it."
            : "This conversation is closed. The member can reopen it by sending a message."}
        </p>
      )}
      <Composer onSend={t.send} disabled={viewer === "admin" && (closed || !threadId)} />
      {viewer === "admin" && (
        <ConfirmDialog
          open={flagTarget !== null}
          onClose={() => setFlagTarget(null)}
          title="Flag this message?"
          description="The message is marked as abusive for the audit trail. The member is not told."
          confirmLabel="Flag message"
          pending={pending}
          error={flagError}
          onConfirm={confirmFlag}
        />
      )}
    </section>
  );
}
