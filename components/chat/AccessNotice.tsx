import Link from "next/link";
import { Ban, Info, Lock } from "lucide-react";
import type { ChatAccess } from "@/lib/community/chat";

/** Explains why there is no composer. `ended` = access lapsed while the page was open. */
export function AccessNotice({ access, ended = false }: { access: Exclude<ChatAccess, "member" | "attendee"> | "ended"; ended?: boolean }) {
  if (access === "blocked") {
    return (
      <div role="status" className="box p-5 shadow-hard">
        <p className="flex items-center gap-2 text-lg font-semibold"><Ban size={20} aria-hidden /> Chat is unavailable on this account</p>
        <p className="mt-2">Contact the organisers if you think this is a mistake.</p>
      </div>
    );
  }
  if (access === "ended" || ended) {
    return (
      <div role="status" className="box p-5 shadow-hard">
        <p className="flex items-center gap-2 text-lg font-semibold"><Lock size={20} aria-hidden /> Chat access has ended</p>
        <p className="mt-2">Your chat access ended because your event is over. Verified IEEE members can always chat with the team.</p>
        <p className="mt-4"><Link className="btn btn-sm btn-secondary" href="/me/membership">Verify your IEEE membership</Link></p>
      </div>
    );
  }
  return (
    <div role="status" className="box p-5 shadow-hard">
      <p className="flex items-center gap-2 text-lg font-semibold"><Info size={20} aria-hidden /> Chat is not open for you yet</p>
      <p className="mt-2">Chat opens for verified IEEE members and for people registered for an upcoming session.</p>
      <p className="mt-4 flex flex-wrap gap-3">
        <Link className="btn btn-sm btn-secondary" href="/me/membership">Verify membership</Link>
        <Link className="btn btn-sm btn-secondary" href="/events">Browse events</Link>
      </p>
    </div>
  );
}
