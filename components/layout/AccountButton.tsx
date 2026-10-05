"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";

export function AccountButton() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  if (!user) {
    const next = pathname.startsWith("/login") || pathname.startsWith("/auth") ? "/" : pathname;
    return (
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-sm btn-primary !px-3">
        Sign in
      </Link>
    );
  }
  const name = profile?.fullName || user.email;
  return (
    <Link
      href={profile?.onboarded ? "/me" : "/onboarding"}
      className="flex h-11 items-center gap-2 border-2 border-ink bg-paper-2 pl-1 pr-3 shadow-[3px_3px_0_0_var(--ink)] hover:bg-yellow"
      aria-label={`${name} — open your dashboard`}
    >
      <Avatar name={name} photo={profile?.avatarUrl ?? undefined} size={34} />
      <span className="hidden max-w-[10ch] truncate font-mono text-xs font-bold uppercase sm:inline">{name.split(" ")[0]}</span>
    </Link>
  );
}
