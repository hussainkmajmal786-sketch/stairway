import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a URL" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string({ message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" }).min(20),
});

export function parsePublicEnv(raw: Record<string, string | undefined>) {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const fields = r.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid env: ${fields}. Copy .env.example to .env.local.`);
  }
  return { supabaseUrl: r.data.NEXT_PUBLIC_SUPABASE_URL, supabaseAnonKey: r.data.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

// Next inlines NEXT_PUBLIC_* at build time, so reference them literally.
export const publicEnv = (() => {
  try {
    return parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  } catch (e) {
    if (process.env.VITEST) return { supabaseUrl: "http://localhost", supabaseAnonKey: "test-key-0000000000" };
    throw e;
  }
})();
