/** True when any cookie looks like a Supabase auth session (plain or chunked). */
export function hasSupabaseSessionCookie(names: string[]): boolean {
  return names.some((n) => n.startsWith("sb-") && /-auth-token(\.\d+)?$/.test(n));
}
