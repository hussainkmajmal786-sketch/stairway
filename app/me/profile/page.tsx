import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm, type ProfileFormValues } from "@/components/profile/ProfileForm";
import { ProjectsEditor } from "@/components/profile/ProjectsEditor";
import { ExperienceEditor } from "@/components/profile/ExperienceEditor";
import { dedupeSkills, experienceFromDb, linksFromDb } from "@/lib/profile/editor";

export const metadata: Metadata = { title: "Edit profile", robots: { index: false } };

export default async function EditProfilePage() {
  // The /me layout has no guard (it can't see the path), so every /me page guards itself.
  const { user, profile } = await requireOnboarded("/me/profile");
  const db = await createClient();
  const [{ data: p }, { data: projects }, { data: experience }] = await Promise.all([
    db.from("profiles").select("full_name, headline, bio, college, branch, year, skills, links, avatar_url").eq("id", user.id).maybeSingle(),
    db.from("profile_projects").select("id, title, description, url").eq("user_id", user.id).order("sort_order").order("created_at"),
    db.from("profile_experience").select("id, title, organization, start_date, end_date, description").eq("user_id", user.id)
      .order("start_date", { ascending: false }).order("created_at"),
  ]);
  if (!p) {
    // requireOnboarded saw the profile, so a miss here is a transient read failure: don't render an empty form
    // that would overwrite the real profile on save.
    return (
      <div className="grid gap-6">
        <h1 className="text-3xl font-semibold md:text-4xl">Your profile</h1>
        <div role="alert" className="box-2 p-5">
          <p className="font-semibold">We couldn&apos;t load your profile right now.</p>
          <p className="mt-1 text-ink-2">Nothing was changed. Reload the page to try again.</p>
          {/* Plain <a>: a full reload re-runs the read. */}
          <a href="/me/profile" className="btn btn-sm btn-secondary mt-4">Try again</a>
        </div>
      </div>
    );
  }
  const initial: ProfileFormValues = {
    fullName: p.full_name, headline: p.headline, bio: p.bio, college: p.college,
    branch: p.branch, year: p.year, skills: dedupeSkills(p.skills), avatarUrl: p.avatar_url,
    links: linksFromDb(p.links),
  };
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold md:text-4xl">Your profile</h1>
        <Link href={`/u/${profile.handle}`} className="btn btn-sm btn-secondary">View public profile</Link>
      </div>
      <ProfileForm userId={user.id} initial={initial} />
      <ProjectsEditor userId={user.id} initial={projects ?? []} />
      <ExperienceEditor userId={user.id} initial={experienceFromDb(experience ?? [])} />
    </div>
  );
}
