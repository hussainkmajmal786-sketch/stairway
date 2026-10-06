import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/ui/PageHero";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { getAuthState } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/safe-next";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/me");
  const { user, profile } = await getAuthState();
  if (user) redirect(profile?.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`);
  const error = sp.error === "auth" ? "Sign-in didn't complete. Please try again." : null;
  return (
    <>
      <PageHero eyebrow="Sign in" title="Join the [[climb.]]" lead="Sign in to register for sessions, build your profile and see who else is climbing." />
      <div className="wrap pb-[var(--section-y)]">
        <LoginPanel next={next} error={error} />
      </div>
    </>
  );
}
