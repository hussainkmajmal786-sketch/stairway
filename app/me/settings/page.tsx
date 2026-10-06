import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSiteData } from "@/lib/site/load";
import { SettingsForm } from "@/components/profile/SettingsForm";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage() {
  const { user } = await requireOnboarded("/me/settings");
  const [db, { settings }] = await Promise.all([createClient(), getSiteData()]);
  const { data } = await db.from("profile_private").select("phone, ieee_member_id").eq("user_id", user.id).maybeSingle();
  const contact = settings.contact.email;
  return (
    <div className="grid gap-8">
      <h1 className="text-3xl font-semibold md:text-4xl">Settings</h1>
      <SettingsForm userId={user.id} email={user.email} initial={{ phone: data?.phone ?? "", ieeeMemberId: data?.ieee_member_id ?? "" }} />
      <section className="box-2 p-5" aria-labelledby="delete-title">
        <h2 id="delete-title" className="mono font-bold">Delete your account</h2>
        <p className="mt-2 text-ink-2">
          To delete your account and profile, email{" "}
          <a className="font-semibold underline" href={`mailto:${contact}?subject=${encodeURIComponent("Delete my st(AI)rway account")}`}>{contact}</a>{" "}
          from the address you signed up with and we&apos;ll remove it.
        </p>
      </section>
    </div>
  );
}
