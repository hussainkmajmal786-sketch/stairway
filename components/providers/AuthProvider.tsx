"use client";

import { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type { AuthState } from "@/lib/auth/types";

const AuthContext = createContext<AuthState>({ user: null, profile: null });

/** Shares the server-verified auth state and refreshes the page when the signed-in user changes. */
export function AuthProvider({ value, children }: { value: AuthState; children: React.ReactNode }) {
  const router = useRouter();
  const serverUserId = value.user?.id ?? null;

  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      if ((session?.user.id ?? null) !== serverUserId) router.refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [serverUserId, router]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
