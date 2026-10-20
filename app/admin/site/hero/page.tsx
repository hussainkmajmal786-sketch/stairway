import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { configToDraft } from "@/lib/admin/hero-editor";
import { heroHandles } from "@/lib/design/hero";
import { SettingsSchema, StatsSchema, readHeroConfig } from "@/lib/site/schema";
import { HeroEditor } from "@/components/admin/HeroEditor";

export const metadata = { title: "Hero section" };

export default async function AdminHeroPage() {
  // Super admins only; everyone else gets the 404 page (no role disclosure), signed out goes to login.
  const { db } = await requireAdmin("/admin/site/hero", { kind: "super" });
  const { data } = await db.from("site_blocks").select("key, data, updated_at").in("key", ["hero", "settings", "stats"]);
  const block = (k: string) => data?.find((b) => b.key === k);
  const hero = block("hero");
  const settings = SettingsSchema.safeParse(block("settings")?.data);
  const stats = StatsSchema.safeParse(block("stats")?.data ?? { items: [] });
  const s = settings.success ? settings.data : null;

  return (
    <div className="grid gap-6">
      <header>
        <Link href="/admin/site" className="mono inline-flex min-h-11 items-center font-bold underline underline-offset-4">
          All site content
        </Link>
        <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Hero section</h1>
        <p className="mt-1 text-ink-3">The look and words at the top of the home page. Save to publish; the preview uses sample dates.</p>
      </header>
      <HeroEditor
        initial={configToDraft(readHeroConfig(hero?.data))}
        updatedAt={hero?.updated_at ?? ""}
        preview={{
          organizerShort: s?.organizer.short ?? "IEEE",
          tagline: s?.tagline ?? "Climb into AI.",
          handles: s ? heroHandles(s) : [],
          stats: stats.success ? stats.data.items : [],
          registerHref: "/events",
        }}
      />
    </div>
  );
}
