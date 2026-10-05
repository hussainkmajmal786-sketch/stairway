import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/ui/PageHero";
import { OnboardingForm } from "@/components/profile/OnboardingForm";
import { requireSignedIn } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";
import { BRANCHES, YEARS } from "@/lib/profile/options";

export const metadata: Metadata = { title: "Finish your profile", robots: { index: false } };

const oneOf = (list: readonly string[], v: string | undefined) => (v && list.includes(v) ? v : "");

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/me");
  const { user, profile } = await requireSignedIn(`/onboarding?next=${encodeURIComponent(next)}`);
  if (profile?.onboarded) redirect(next);
  const db = await createClient();
  const { data: row } = await db
    .from("profiles")
    .select("handle, full_name, college, branch, year, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  return (
    <>
      <PageHero eyebrow="Welcome" title="Set up your [[profile.]]" lead="A minute now means one-tap registration later." />
      <div className="wrap pb-[var(--section-y)]">
        <OnboardingForm
          userId={user.id}
          next={next}
          initial={{
            fullName: row?.full_name ?? "",
            handle: row?.handle ?? "",
            college: row?.college || "College of Engineering Kidangoor",
            branch: oneOf(BRANCHES, row?.branch),
            year: oneOf(YEARS, row?.year),
            avatarUrl: row?.avatar_url ?? null,
          }}
        />
      </div>
    </>
  );
}
