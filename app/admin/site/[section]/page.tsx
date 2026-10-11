import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { ENTITY_FIELDS } from "@/lib/admin/entity-fields";
import { parseSection, SITE_SECTIONS } from "@/lib/admin/site-sections";
import { SettingsSchema } from "@/lib/site/schema";
import { EntityListEditor, type EntityItem } from "@/components/admin/EntityListEditor";
import { SettingsForm, StatsEditor, type SettingsValues } from "@/components/admin/SettingsForm";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const linksOf = (v: unknown): Record<string, string> => {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, str(x)]));
};

export default async function AdminSiteSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: raw } = await params;
  const path = `/admin/site/${raw}`;
  // Super admins only; everyone else (and any unknown section) gets the 404 page.
  const { db } = await requireAdmin(path, { kind: "super" });
  const section = parseSection(raw);
  if (!section) notFound();
  const meta = SITE_SECTIONS.find((s) => s.key === section)!;

  let body: React.ReactNode = null;
  if (section === "settings") {
    const { data } = await db.from("site_blocks").select("data, updated_at").eq("key", "settings").maybeSingle();
    const parsed = SettingsSchema.safeParse(data?.data);
    if (!data || !parsed.success) notFound();
    const s = parsed.data;
    const initial: SettingsValues = {
      announcement: s.announcement, tagline: s.tagline, supportLine: s.supportLine, description: s.description,
      contact: s.contact, social: s.social, ieee: s.ieee, aftermovieUrl: s.aftermovieUrl,
      sponsorDeckUrl: s.sponsorDeckUrl, speakerFormUrl: s.speakerFormUrl, volunteerFormUrl: s.volunteerFormUrl,
    };
    body = <SettingsForm initial={initial} updatedAt={data.updated_at} />;
  } else if (section === "stats") {
    const { data } = await db.from("site_blocks").select("data, updated_at").eq("key", "stats").maybeSingle();
    const items = ((data?.data as { items?: unknown } | null)?.items ?? []) as { label?: unknown; value?: unknown; suffix?: unknown }[];
    body = (
      <StatsEditor
        updatedAt={data?.updated_at ?? ""}
        initial={items.map((i) => ({
          label: str(i.label), value: typeof i.value === "number" ? i.value : 0, suffix: str(i.suffix),
        }))}
      />
    );
  } else if (section === "sponsors") {
    const { data } = await db.from("sponsors").select("id, name, url, logo_url, tier, tier_size, updated_at").order("sort_order");
    const items: EntityItem[] = (data ?? []).map((s) => ({
      id: s.id, updatedAt: s.updated_at, title: s.name, subtitle: s.tier,
      values: { name: s.name, url: s.url, tier: s.tier, tierSize: s.tier_size, logoUrl: s.logo_url ?? "" },
    }));
    body = <EntityListEditor entity="sponsor" noun="Sponsor" items={items} fields={ENTITY_FIELDS.sponsor} canEdit />;
  } else if (section === "team") {
    const { data } = await db
      .from("team_members")
      .select('id, name, role, "group", photo_url, fun_fact, links, updated_at')
      .order("sort_order");
    const items: EntityItem[] = (data ?? []).map((m) => {
      const links = linksOf(m.links);
      return {
        id: m.id, updatedAt: m.updated_at, title: m.name, subtitle: `${m.role} · ${m.group}`,
        values: {
          name: m.name, role: m.role, group: m.group, funFact: m.fun_fact, photoUrl: m.photo_url ?? "",
          "links.linkedin": links.linkedin ?? "", "links.instagram": links.instagram ?? "", "links.github": links.github ?? "",
        },
      };
    });
    body = <EntityListEditor entity="team" noun="Team member" items={items} fields={ENTITY_FIELDS.team} canEdit />;
  } else if (section === "faq") {
    const { data } = await db.from("faqs").select("id, question, answer, updated_at").order("sort_order");
    const items: EntityItem[] = (data ?? []).map((f) => ({
      id: f.id, updatedAt: f.updated_at, title: f.question, values: { question: f.question, answer: f.answer },
    }));
    body = <EntityListEditor entity="faq" noun="Question" items={items} fields={ENTITY_FIELDS.faq} canEdit />;
  } else if (section === "testimonials") {
    const { data } = await db.from("testimonials").select("id, quote, name, detail, step_label, photo_url, updated_at").order("sort_order");
    const items: EntityItem[] = (data ?? []).map((t) => ({
      id: t.id, updatedAt: t.updated_at, title: t.name, subtitle: t.quote,
      values: { quote: t.quote, name: t.name, detail: t.detail, stepLabel: t.step_label, photoUrl: t.photo_url ?? "" },
    }));
    body = <EntityListEditor entity="testimonial" noun="Testimonial" items={items} fields={ENTITY_FIELDS.testimonial} canEdit />;
  } else {
    const { data } = await db
      .from("speakers")
      .select("id, slug, name, designation, organization, photo_url, bio, topic, links, updated_at")
      .is("society_id", null)
      .order("sort_order");
    const items: EntityItem[] = (data ?? []).map((s) => {
      const links = linksOf(s.links);
      return {
        id: s.id, updatedAt: s.updated_at, title: s.name, subtitle: [s.designation, s.organization].filter(Boolean).join(", "),
        values: {
          name: s.name, slug: s.slug, designation: s.designation, organization: s.organization, topic: s.topic, bio: s.bio,
          photoUrl: s.photo_url ?? "",
          ...Object.fromEntries(["linkedin", "github", "x", "instagram", "website"].map((k) => [`links.${k}`, links[k] ?? ""])),
        },
      };
    });
    body = <EntityListEditor entity="speaker" noun="Speaker" items={items} fields={ENTITY_FIELDS.speaker} canEdit />;
  }

  return (
    <div className="grid gap-6">
      <header>
        <Link href="/admin/site" className="mono inline-flex min-h-11 items-center font-bold underline underline-offset-4">
          All site content
        </Link>
        <h1 className="mt-2 text-3xl font-semibold md:text-4xl">{meta.label}</h1>
        <p className="mt-1 text-ink-3">{meta.help}</p>
      </header>
      {body}
    </div>
  );
}
