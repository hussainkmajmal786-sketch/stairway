import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SwitcherSociety {
  slug: string;
  shortName: string;
}

/** Plain links (works without JS). `current` is the selected society slug or null for "All societies". */
export function SocietySwitcher({
  basePath,
  societies,
  current,
  allowAll,
  extraQuery = "",
}: {
  basePath: string;
  societies: SwitcherSociety[];
  current: string | null;
  allowAll: boolean;
  /** Already-encoded extra query (e.g. "tab=drafts"), appended after the society param. */
  extraQuery?: string;
}) {
  if (!allowAll && societies.length < 2) return null;
  const href = (slug: string | null) => {
    const q = [slug ? `society=${encodeURIComponent(slug)}` : "", extraQuery].filter(Boolean).join("&");
    return q ? `${basePath}?${q}` : basePath;
  };
  const items = [...(allowAll ? [{ slug: null as string | null, label: "All societies" }] : []), ...societies.map((s) => ({ slug: s.slug as string | null, label: s.shortName }))];
  return (
    <nav aria-label="Society" className="flex flex-wrap gap-2">
      {items.map((i) => {
        const active = i.slug === current;
        return (
          <Link
            key={i.slug ?? "all"}
            href={href(i.slug)}
            aria-current={active ? "true" : undefined}
            className={cn("chip-btn inline-flex min-h-11 items-center", active && "bg-ink text-paper")}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
