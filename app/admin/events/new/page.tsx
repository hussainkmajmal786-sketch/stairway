import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listAdminSocieties } from "@/lib/admin/societies";
import { EventForm, EMPTY_VALUES } from "@/components/admin/EventForm";

export default async function NewEventPage() {
  const { ctx, db } = await requireAdmin("/admin/events/new");
  const societies = await listAdminSocieties(db, ctx);
  const ids = societies.map((s) => s.id);
  const { data: tracks } = ids.length
    ? await db.from("tracks").select("id, name, society_id").in("society_id", ids).order("sort_order")
    : { data: [] };
  const { data: steps } = ids.length
    ? await db.from("events").select("step_number").in("society_id", ids)
    : { data: [] };
  const nextStep = Math.max(0, ...(steps ?? []).map((s) => s.step_number)) + 1;

  return (
    <div className="grid gap-6">
      <header>
        <Link href="/admin/events" className="mono inline-flex min-h-11 items-center font-bold underline underline-offset-4">
          Back to events
        </Link>
        <h1 className="mt-2 text-3xl font-semibold md:text-4xl">New session</h1>
        <p className="mt-2 text-ink-3">It starts as a draft. Publish it when it is ready.</p>
      </header>
      <EventForm
        mode="create"
        isSuper={ctx.isSuper}
        societies={societies.map((s) => ({ id: s.id, name: s.name }))}
        tracks={(tracks ?? []).map((t) => ({ id: t.id, name: t.name, societyId: t.society_id }))}
        initial={{ ...EMPTY_VALUES, step: String(nextStep) }}
      />
    </div>
  );
}
