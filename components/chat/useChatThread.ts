"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/browser";
import { ChatThreadController, type ChatClient, type ChatSnapshot, type ChatStatus, type SendResult } from "@/lib/community/chat-thread";
import type { ChatMessage } from "@/lib/community/chat";

export interface UseChatThread extends Pick<ChatSnapshot, "messages" | "status" | "access" | "threadStatus" | "threadId"> {
  send: (body: string) => Promise<SendResult>;
  markRead: () => void;
}
export type { ChatStatus };

/**
 * Realtime subscription + 20 s polling backstop for one thread. The controller (lib/community/chat-thread.ts) holds
 * all behaviour; this hook only binds it to React. It is created once per mount, so mount it with `key={threadId}`.
 * It never runs on the server: start() is called from an effect, and the browser client is created lazily.
 */
export function useChatThread({ threadId, initial, viewer }: { threadId: string | null; initial: ChatMessage[]; viewer: "user" | "admin" }): UseChatThread {
  const [ctl] = useState(
    () =>
      new ChatThreadController({
        client: () => createClient() as unknown as ChatClient,
        threadId,
        initial,
        viewer,
        isVisible: () => typeof document === "undefined" || document.visibilityState === "visible",
        onVisibility: (cb) => {
          document.addEventListener("visibilitychange", cb);
          return () => document.removeEventListener("visibilitychange", cb);
        },
      }),
  );
  useEffect(() => {
    void ctl.start();
    return () => ctl.stop();
  }, [ctl]);
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot, ctl.getSnapshot);
  const send = useCallback((body: string) => ctl.send(body), [ctl]);
  const markRead = useCallback(() => ctl.markRead(), [ctl]);
  return { messages: snap.messages, status: snap.status, access: snap.access, threadStatus: snap.threadStatus, threadId: snap.threadId, send, markRead };
}
