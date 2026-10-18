import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/ui/PageHero";
import { AcceptInvite } from "@/components/admin/AcceptInvite";
import { INVITE_TOKEN_RE } from "@/lib/admin/invite";
import { requireSignedIn } from "@/lib/auth/session";

// Outside the /admin guard on purpose: the invitee has no role yet. The token comes from the path only.
export const metadata: Metadata = { title: "Admin invite", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  if (!INVITE_TOKEN_RE.test(token)) notFound();
  await requireSignedIn(`/invite/${token}`);
  return (
    <>
      <PageHero eyebrow="Invite" title="Accept your [[admin invite.]]" lead="Sign in with the Google account the invite was sent to. An invite works once, for one account." />
      <div className="wrap pb-[var(--section-y)]">
        <AcceptInvite token={token} />
      </div>
    </>
  );
}
