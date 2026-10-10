import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Static guards for the secret boundary: the service-role client and the secret-reading config are server-only,
// never reachable from a "use client" module, and the service role is imported only where the plan allows it.

const ROOT = resolve(__dirname, "../..");
const SCAN = ["app", "components", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(p);
  }
  return out;
}

const files = SCAN.flatMap((d) => walk(join(ROOT, d))).map((p) => ({
  path: relative(ROOT, p).replace(/\\/g, "/"),
  src: readFileSync(p, "utf8"),
}));

const isClient = (src: string) => /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);
// Value imports only: `import type { … }` erases at build time and is harmless.
const valueImports = (src: string, mod: RegExp) =>
  [...src.matchAll(/^\s*import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)].some((m) => mod.test(m[1]));

const ADMIN = /^(?:@\/lib\/supabase\/admin|\.{1,2}\/(?:.*\/)?admin)$/;
const CONFIG = /^(?:@\/lib\/payments\/config|\.{1,2}\/(?:.*\/)?config)$/;
const ADMIN_ALLOWED = new Set([
  "lib/payments/actions.ts",
  "app/api/payments/webhook/route.ts",
  "lib/payments/refunds.ts",
  "app/api/cron/tick/route.ts",
]);

describe("payment secret boundaries", () => {
  it("marks the service-role client and the secret config as server-only", () => {
    for (const f of ["lib/supabase/admin.ts", "lib/payments/config.ts"]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src.trimStart().startsWith('import "server-only";'), f).toBe(true);
    }
  });

  it("never imports the service-role client or the secret config from a client module", () => {
    expect(files.filter((f) => isClient(f.src)).length).toBeGreaterThan(0); // the scan is not vacuous
    expect(valueImports('"use client";\nimport { createAdminClient } from "@/lib/supabase/admin";', ADMIN)).toBe(true);
    expect(valueImports('import type { AdminClient } from "@/lib/supabase/admin";', ADMIN)).toBe(false);
    const offenders = files
      .filter((f) => isClient(f.src) && (valueImports(f.src, ADMIN) || valueImports(f.src, CONFIG)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("imports the service-role client only from the allowed server entry points", () => {
    const importers = files
      .filter((f) => f.path !== "lib/supabase/admin.ts" && valueImports(f.src, /^@\/lib\/supabase\/admin$|\/admin$/))
      .map((f) => f.path)
      .filter((p) => !ADMIN_ALLOWED.has(p));
    expect(importers).toEqual([]);
  });

  it("has no module-level service-role client (one per request, never cached across Worker requests)", () => {
    const src = readFileSync(join(ROOT, "lib/supabase/admin.ts"), "utf8");
    expect(src).not.toMatch(/^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*createClient/m);
  });

  it("never exposes a secret through a NEXT_PUBLIC_ variable", () => {
    const leaks = files.filter((f) =>
      /NEXT_PUBLIC_[A-Z_]*(?:SECRET|SERVICE_ROLE|RAZORPAY|CRON|SYNC)/.test(f.src)).map((f) => f.path);
    expect(leaks).toEqual([]);
    expect(readFileSync(join(ROOT, ".env.example"), "utf8")).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(?:SECRET|SERVICE_ROLE|RAZORPAY|CRON|SYNC)/);
  });

  it("keeps Node-only modules out of the payment runtime code", () => {
    for (const f of [
      "lib/payments/crypto.ts", "lib/payments/razorpay.ts", "lib/payments/money.ts", "lib/payments/config.ts", "lib/supabase/admin.ts",
      "lib/payments/confirm.ts", "lib/payments/actions.ts",
    ]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src, f).not.toMatch(/from\s+["'](?:node:|crypto["']|buffer["'])/);
      expect(src, f).not.toMatch(/\bBuffer\.(?:from|alloc|concat|byteLength)\b/);
    }
  });

  it("exports only async functions (and erased types) from the payment server actions file", () => {
    const src = readFileSync(join(ROOT, "lib/payments/actions.ts"), "utf8");
    expect(src.trimStart().startsWith('"use server";')).toBe(true);
    const valueExports = [...src.matchAll(/^export\s+(?!type\s|interface\s)(\S+(?:\s+\S+)?)/gm)].map((m) => m[1]);
    expect(valueExports.length).toBeGreaterThan(0);
    for (const e of valueExports) expect(e).toMatch(/^async function$/);
  });
});
