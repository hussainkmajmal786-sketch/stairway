import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { canManageSociety } from "@/lib/admin/caps";
import { ENTITY_FIELDS } from "@/lib/admin/entity-fields";
import { EntityListEditor, type EntityItem } from "@/components/admin/EntityListEditor";
import { SocietyForm } from "@/components/admin/SocietyForm";

const TABS = [
  { key: "page", label: "Page" },
  { key: "tracks", label: "Tracks" },
  { key: "speakers", label: "Speakers" },
  { key: "gallery", label: "Gallery" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const LINK_KEYS = ["linkedin", "github", "x", "instagram", "website"] as const;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const linksOf = (v: unknown): Record<string, string> => {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, str(x)]));
};

export default async function AdminSocietyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const path = `/admin/society/${slug}`;
  const { ctx, db } = await requireAdmin(path);

  // Slug -> id on the server, then scope-checked against the verified roles. Unknown and not-yours are both a 404.
  if (!/^[a-z0-9-]{2,20}$/.test(slug)) notFound();
  const { data: society } = await db
    .from("societies")
    .select("id, slug, name, short_name, color, sort_order, description, logo_url, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!society || !canManageSociety(ctx, society.id)) notFound();

  const wanted = typeof sp.tab === "string" ? sp.tab : "page";
  const tab: Tab = TABS.find((t) => t.key === wanted)?.key ?? "page";
  const sid = society.id;

  let body: React.ReactNode = null;
  if (tab === "page") {
    body = (
      <SocietyForm
        societyId={sid}
        updatedAt={society.updated_at}
        description={society.description}
        logoUrl={society.logo_url}
        identity={
          ctx.isSuper
            ? { name: society.name, shortName: society.short_name, color: society.color, sortOrder: society.sort_order }
            : undefined
        }
      />
    );
  } else if (tab === "tracks") {
    const { data } = await db.from("tracks").select("id, name, description, updated_at").eq("society_id", sid).order("sort_order");
    const items: EntityItem[] = (data ?? []).map((t) => ({
      id: t.id, updatedAt: t.updated_at, title: t.name, subtitle: t.description,
      values: { name: t.name, description: t.description },
    }));
    body = <EntityListEditor entity="track" noun="Track" items={items} fields={ENTITY_FIELDS.track} societyId={sid} canEdit />;
  } else if (tab === "speakers") {
    const { data } = await db
      .from("speakers")
      .select("id, slug, name, designation, organization, photo_url, bio, topic, links, updated_at")
      .eq("society_id", sid)
      .order("sort_order");
    const items: EntityItem[] = (data ?? []).map((s) => {
      const links = linksOf(s.links);
      return {
        id: s.id, updatedAt: s.updated_at, title: s.name, subtitle: [s.designation, s.organization].filter(Boolean).join(", "),
        values: {
          name: s.name, slug: s.slug, designation: s.designation, organization: s.organization, topic: s.topic, bio: s.bio,
          photoUrl: s.photo_url ?? "",
          ...Object.fromEntries(LINK_KEYS.map((k) => [`links.${k}`, links[k] ?? ""])),
        },
      };
    });
    body = <EntityListEditor entity="speaker" noun="Speaker" items={items} fields={ENTITY_FIELDS.speaker} societyId={sid} canEdit />;
  } else {
    const [{ data }, { data: events }] = await Promise.all([
      db.from("gallery_items").select("id, image_url, caption, alt, ratio, event_id, updated_at").eq("society_id", sid).order("sort_order"),
      db.from("events").select("id, title").eq("society_id", sid).order("starts_at", { ascending: false }).limit(100),
    ]);
    const items: EntityItem[] = (data ?? []).map((g) => ({
      id: g.id, updatedAt: g.updated_at, title: g.alt || g.caption || "Photo", subtitle: g.caption,
      values: { imageUrl: g.image_url ?? "", alt: g.alt, caption: g.caption, ratio: g.ratio, eventId: g.event_id ?? "" },
    }));
    body = (
      <EntityListEditor
        entity="gallery"
        noun="Photo"
        items={items}
        fields={ENTITY_FIELDS.gallery}
        societyId={sid}
        canEdit
        eventOptions={(events ?? []).map((e) => ({ id: e.id, title: e.title }))}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <header>
        <Link href="/admin/society" className="mono inline-flex min-h-11 items-center font-bold underline underline-offset-4">
          All societies
        </Link>
        <h1 className="mt-2 break-words text-3xl font-semibold md:text-4xl">{society.name}</h1>
        <p className="mt-3">
          <Link href={`/s/${society.slug}`} className="btn btn-secondary btn-sm">
            <ExternalLink size={16} aria-hidden /> View public page
          </Link>
        </p>
      </header>
      <nav aria-label="Society sections" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${path}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}
