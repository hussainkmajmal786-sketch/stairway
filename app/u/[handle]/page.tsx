import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProfileView, type ProfileViewData } from "@/components/profile/ProfileView";
import { dedupeSkills } from "@/lib/profile/editor";
import { parseHandleParam, safeLinks } from "@/lib/profile/view";

// Profiles are visible to signed-in members only: never index them.
export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };

export default async function ProfilePage({ params }: PageProps<"/u/[handle]">) {
  const { handle: raw } = await params;
  const handle = parseHandleParam(raw);
  // Auth first so signed-out visitors can't probe which handles exist.
  const { user } = await requireSignedIn(`/u/${encodeURIComponent(handle ?? raw.toLowerCase())}`);
  if (!handle) notFound();

  const db = await createClient();
  // Only public columns: email / phone / IEEE id live in profile_private (owner-only RLS) and are never read here.
  const { data: p } = await db
    .from("profiles")
    .select("id, handle, full_name, avatar_url, headline, bio, college, branch, year, skills, links, onboarded")
    .eq("handle", handle)
    .maybeSingle();
  if (!p) notFound();
  if (!p.onboarded) {
    // The owner gets sent to finish onboarding; anyone else sees a 404.
    if (p.id === user.id) redirect(`/onboarding?next=${encodeURIComponent(`/u/${handle}`)}`);
    notFound();
  }

  const [{ data: projects }, { data: experience }] = await Promise.all([
    db.from("profile_projects").select("id, title, description, url").eq("user_id", p.id).order("sort_order").order("created_at"),
    db.from("profile_experience").select("id, title, organization, start_date, end_date, description").eq("user_id", p.id)
      .order("start_date", { ascending: false }).order("created_at"),
  ]);

  const data: ProfileViewData = {
    handle: p.handle, fullName: p.full_name, avatarUrl: p.avatar_url, headline: p.headline, bio: p.bio,
    college: p.college, branch: p.branch, year: p.year, skills: dedupeSkills(p.skills),
    links: safeLinks(p.links),
    projects: projects ?? [], experience: experience ?? [],
    isOwner: user.id === p.id,
  };
  return <ProfileView p={data} />;
}
