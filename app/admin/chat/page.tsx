import type { Metadata } from "next";
import Link from "next/link";
import { ThreadList } from "@/components/admin/community/ThreadList";
import { requireAdmin } from "@/lib/admin/auth";
import { parseThreads } from "@/lib/community/chat";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Chat", robots: { index: false, follow: false } };

const PAGE = 50;
const FILTERS = [["all", "All"], ["open", "Open"], ["closed", "Closed"]] as const;
const one = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : "");

export default async function AdminChatPage({ searchParams }: PageProps<"/admin/chat">) {
  // Super admin only: society admins and plain users get the 404 page, signed-out visitors go to login.
  const { db } = await requireAdmin("/admin/chat", { kind: "super" });
  const sp = await searchParams;
  const status = (["open", "closed"] as string[]).includes(one(sp.status)) ? one(sp.status) : "all";
  const pageNo = Math.min(Math.max(Number.parseInt(one(sp.page) || "1", 10) || 1, 1), 1000);
  const { data, error } = await db.rpc("admin_chat_threads", { p_status: status, p_limit: PAGE, p_offset: (pageNo - 1) * PAGE });
  const { total, rows } = parseThreads(data);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: number, s = status) => `/admin/chat?${new URLSearchParams({ ...(s !== "all" ? { status: s } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-semibold md:text-4xl">Chat</h1>
      <nav aria-label="Thread filter" className="flex flex-wrap gap-2">
        {FILTERS.map(([v, label]) => (
          <Link key={v} href={href(1, v)} aria-current={status === v ? "page" : undefined}
            className={cn("btn btn-sm min-h-11", status === v ? "btn-primary" : "btn-secondary")}>{label}</Link>
        ))}
      </nav>
      {error ? (
        <div role="alert" className="border-2 border-red-ink bg-error-bg p-4 font-semibold text-red-ink">
          Conversations could not be loaded. <Link className="underline" href={href(pageNo)}>Try again</Link>
        </div>
      ) : (
        <ThreadList rows={rows} />
      )}
      {pages > 1 && (
        <nav aria-label="Thread pages" className="flex items-center gap-3">
          {pageNo > 1 && <Link className="btn btn-sm btn-secondary" href={href(pageNo - 1)}>Previous</Link>}
          <span className="text-sm text-ink-3">Page {pageNo} of {pages}</span>
          {pageNo < pages && <Link className="btn btn-sm btn-secondary" href={href(pageNo + 1)}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
