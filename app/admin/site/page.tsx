import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { SITE_SECTIONS } from "@/lib/admin/site-sections";

export default async function AdminSitePage() {
  await requireAdmin("/admin/site", { kind: "super" });
  return (
    <div className="grid gap-6">
      <header>
        <p className="mono font-bold text-ink-3">Admin</p>
        <h1 className="text-3xl font-semibold md:text-4xl">Site content</h1>
        <p className="mt-2 text-ink-3">Changes appear on the public site straight away.</p>
      </header>
      <ul className="box shadow-hard divide-y-2 divide-ink">
        {SITE_SECTIONS.map((s) => (
          <li key={s.key}>
            <Link href={`/admin/site/${s.key}`} className="block min-h-14 p-4 hover:bg-paper-2">
              <span className="block font-semibold">{s.label}</span>
              <span className="block text-sm text-ink-3">{s.help}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
