import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/admin/events",
}));

import { DashboardShell } from "@/components/dashboard/DashboardShell";

function render(isSuper: boolean) {
  const props = { variant: "admin", isSuper } as Parameters<typeof DashboardShell>[0];
  return renderToStaticMarkup(createElement(DashboardShell, props, createElement("h1", null, "Events")));
}

describe("admin DashboardShell", () => {
  it("keeps Back to site as the first focusable control", () => {
    for (const isSuper of [true, false]) {
      const out = render(isSuper);
      const first = /<(a|button|input|select|textarea)\b[^>]*>/.exec(out)?.[0] ?? "";
      expect(first).toMatch(/^<a\b/);
      expect(first).toContain('href="/"');
      expect(out.indexOf("Back to site")).toBeLessThan(out.indexOf("Overview"));
    }
  });

  it("shows super-only sections to super admins only", () => {
    const sup = render(true);
    const soc = render(false);
    for (const href of ["/admin/site", "/admin/people", "/admin/audit", "/admin/settings"]) {
      expect(sup).toContain(`href="${href}"`);
      expect(soc).not.toContain(`href="${href}"`);
    }
    for (const href of ["/admin", "/admin/events", "/admin/society"]) expect(soc).toContain(`href="${href}"`);
  });

  it("fails closed when isSuper is omitted", () => {
    const props = { variant: "admin" } as Parameters<typeof DashboardShell>[0];
    const out = renderToStaticMarkup(createElement(DashboardShell, props, null));
    expect(out).not.toContain('href="/admin/people"');
  });

  it("marks the events section current", () => {
    expect(render(true)).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/admin\/events"|<a[^>]*href="\/admin\/events"[^>]*aria-current="page"/);
  });
});
