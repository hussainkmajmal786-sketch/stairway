import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm, type ProfileFormValues } from "@/components/profile/ProfileForm";
import { ProjectsEditor } from "@/components/profile/ProjectsEditor";
import { ExperienceEditor } from "@/components/profile/ExperienceEditor";
import { experienceFromDb, linksFromDb } from "@/lib/profile/editor";

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
  const initial: ProfileFormValues = {
    fullName: p?.full_name ?? profile.fullName, headline: p?.headline ?? "", bio: p?.bio ?? "", college: p?.college ?? "",
    branch: p?.branch ?? "", year: p?.year ?? "", skills: p?.skills ?? [], avatarUrl: p?.avatar_url ?? null,
    links: linksFromDb(p?.links),
  };
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold md:text-4xl">Your profile</h1>
        <Link href={`/u/${profile.handle}`} className="btn btn-sm btn-ghost">View public profile</Link>
      </div>
      <ProfileForm userId={user.id} initial={initial} />
      <ProjectsEditor userId={user.id} initial={projects ?? []} />
      <ExperienceEditor userId={user.id} initial={experienceFromDb(experience ?? [])} />
    </div>
  );
}
