import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/me/tickets/0c5e1d0e-0000-4000-8000-000000000000" }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => nav.pathname,
}));

import { DashboardShell } from "@/components/dashboard/DashboardShell";

function render(pathname: string) {
  nav.pathname = pathname;
  // children go in as createElement's rest argument (react/no-children-prop); the cast satisfies the required prop
  const props = { variant: "me" } as Parameters<typeof DashboardShell>[0];
  return renderToStaticMarkup(createElement(DashboardShell, props, createElement("h1", null, "My tickets")));
}

const out = render("/me/tickets/0c5e1d0e-0000-4000-8000-000000000000");

function currentHrefs(html: string) {
  return [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>/g)].map((m) => /href="([^"]*)"/.exec(m[0])?.[1]);
}

describe("DashboardShell", () => {
  it("keeps Back to site as the first control, at the top of the sidebar", () => {
    const first = /<(a|button|input|select|textarea)\b[^>]*>/.exec(out)?.[0] ?? "";
    expect(first).toMatch(/^<a\b/);
    expect(first).toContain('href="/"');
    // the very first thing inside the sidebar panel is the Back to site link
    expect(out).toMatch(/<aside class="panel[^"]*"><a [^>]*href="\/"[^>]*>.*?Back to site<\/a>/);
    expect(out.indexOf("Back to site")).toBeLessThan(out.indexOf("Overview"));
  });

  it("keeps the nav order and Sign out as a POST form", () => {
    const order = ["Back to site", "Overview", "My tickets", "Profile", "Settings", "Sign out"].map((l) => out.indexOf(l));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).toMatch(/<form [^>]*action="\/auth\/signout" method="post"[^>]*><button type="submit"/);
  });

  it("puts the chrome on the field and every page on a cream panel", () => {
    expect(out).toMatch(/^<div class="field on-field[^"]*">/);
    expect(out).toMatch(/<aside class="panel[^"]*">/);
    expect(out).toContain('<div class="panel min-w-0 p-5 md:p-8"><h1>My tickets</h1></div>');
    expect(out).not.toContain('class="ghost"');
  });

  it("keeps 48px nav targets in the horizontal mobile tab strip", () => {
    expect(out).toMatch(/<nav [^>]*class="[^"]*\bflex\b[^"]*\boverflow-x-auto\b[^"]*lg:flex-col/);
    // without min-w-0 the strip's max-content width stretches the grid track past a phone viewport
    expect(out).toMatch(/<aside class="panel min-w-0 [^"]*">/);
    const items = [...out.matchAll(/<a[^>]*href="\/me[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(items).toHaveLength(4);
    for (const a of items) expect(a).toContain("h-12");
  });

  it("marks My tickets as the current section on a ticket page", () => {
    expect(currentHrefs(out)).toEqual(["/me/tickets"]);
  });

  it.each([
    ["/me", "/me"],
    ["/me/tickets", "/me/tickets"],
    ["/me/profile", "/me/profile"],
    ["/me/settings", "/me/settings"],
  ])("marks exactly one current item on %s", (path, href) => {
    expect(currentHrefs(render(path))).toEqual([href]);
  });
});
