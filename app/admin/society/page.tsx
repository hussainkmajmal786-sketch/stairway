import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { listAdminSocieties } from "@/lib/admin/societies";

export default async function AdminSocietiesPage() {
  const { ctx, db } = await requireAdmin("/admin/society");
  const societies = await listAdminSocieties(db, ctx);
  if (societies.length === 1) redirect(`/admin/society/${societies[0].slug}`);

  return (
    <div className="grid gap-6">
      <header>
        <p className="mono font-bold text-ink-3">Admin</p>
        <h1 className="text-3xl font-semibold md:text-4xl">Societies</h1>
      </header>
      {societies.length === 0 ? (
        <p className="box p-5">You do not manage a society yet.</p>
      ) : (
        <ul className="box shadow-hard divide-y-2 divide-ink">
          {societies.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/society/${s.slug}`} className="flex min-h-14 items-center justify-between gap-3 p-4 font-semibold hover:bg-paper-2">
                <span className="break-words">{s.name}</span>
                <span className="tag tag-outline shrink-0">{s.shortName}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
