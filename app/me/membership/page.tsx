import type { Metadata } from "next";
import { MembershipPanel } from "@/components/membership/MembershipPanel";
import { requireOnboarded } from "@/lib/auth/session";
import { parseMembership } from "@/lib/community/membership";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Membership", robots: { index: false, follow: false } };

export default async function MembershipPage() {
  // The /me layout has no guard (it cannot see the path), so every /me page guards itself.
  await requireOnboarded("/me/membership");
  const db = await createClient();
  const { data, error } = await db.rpc("my_membership");
  return (
    <div className="grid gap-8">
      <h1 className="text-3xl font-semibold md:text-4xl">IEEE membership</h1>
      {error ? (
        <div role="alert" className="box-2 p-5">
          <p className="font-semibold">We could not load your membership right now.</p>
          <a href="/me/membership" className="btn btn-sm btn-secondary mt-4">Try again</a>
        </div>
      ) : (
        <MembershipPanel m={parseMembership(data)} />
      )}
    </div>
  );
}
