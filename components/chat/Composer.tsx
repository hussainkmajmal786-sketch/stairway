"use client";

import { useId, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { textareaCls } from "@/components/ui/Field";
import { CHAT_MAX, canSendChat, chatErrorCopy, isSendShortcut } from "@/lib/community/chat";
import type { SendResult } from "@/lib/community/chat-thread";

/** Labelled textarea, n/1000 counter, Send disabled while empty/sending, Ctrl/Cmd+Enter sends, Enter = newline. */
export function Composer({ onSend, disabled = false }: { onSend: (body: string) => Promise<SendResult>; disabled?: boolean }) {
  const id = useId();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !disabled && canSendChat(body, sending);

  async function submit() {
    if (!ready) return;
    setSending(true);
    setError(null);
    const r = await onSend(body);
    setSending(false);
    if (r.ok) setBody("");
    else setError(chatErrorCopy(r.code));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="grid gap-2"
    >
      <label htmlFor={id} className="mono font-bold">Message</label>
      <textarea
        id={id}
        className={textareaCls}
        rows={3}
        maxLength={CHAT_MAX}
        value={body}
        disabled={disabled}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (isSendShortcut(e)) {
            e.preventDefault();
            void submit();
          }
        }}
        aria-describedby={`${id}-hint${error ? ` ${id}-err` : ""}`}
        aria-invalid={error ? true : undefined}
      />
      <p id={`${id}-hint`} className="text-xs text-ink-3">{body.length}/{CHAT_MAX} · Ctrl or Cmd + Enter sends, Enter starts a new line. Plain text only.</p>
      {error && <p id={`${id}-err`} role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">{error}</p>}
      <div>
        <button type="submit" className="btn btn-primary min-h-12" disabled={!ready} aria-busy={sending}>
          {sending ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Send size={18} strokeWidth={2} aria-hidden />}
          Send
        </button>
      </div>
    </form>
  );
}
