import { describe, expect, it } from "vitest";
import { gaBootstrap, pageViewStep, scrubReferrer, scrubUrl } from "@/lib/analytics";

const UUID = "33333333-3333-4333-8333-333333333333";
const ORIGIN = "https://stairway.example";

/** Runs the inline bootstrap against a fake page and returns what it pushed to dataLayer. */
function runBootstrap(href: string, referrer = "", id = "G-TEST123"): unknown[][] {
  const dataLayer: unknown[] = [];
  const win: Record<string, unknown> = { dataLayer };
  const location = new URL(href);
  new Function("window", "location", "document", "dataLayer", gaBootstrap(id))(win, location, { referrer }, dataLayer);
  return dataLayer.map((a) => Array.from(a as ArrayLike<unknown>));
}

describe("scrubUrl", () => {
  it("replaces id segments, keeps only allowlisted query keys, drops the hash", () => {
    expect(scrubUrl(`${ORIGIN}/me/tickets/${UUID}?new=1&utm_source=wa&gclid=abc&x=1#top`)).toBe(
      `${ORIGIN}/me/tickets/:id?utm_source=wa&gclid=abc`,
    );
    expect(scrubUrl(`${ORIGIN}/me/tickets?cancelled=1`)).toBe(`${ORIGIN}/me/tickets`);
    expect(scrubUrl(`${ORIGIN}/?utm_medium=social&utm_campaign=s1&utm_term=t&utm_content=c`)).toBe(
      `${ORIGIN}/?utm_medium=social&utm_campaign=s1&utm_term=t&utm_content=c`,
    );
    expect(scrubUrl("not a url")).toBe("");
  });
  it("keeps a cross-origin referrer and scrubs a same-origin one", () => {
    expect(scrubReferrer("https://l.instagram.com/?u=x", ORIGIN)).toBe("https://l.instagram.com/?u=x");
    expect(scrubReferrer(`${ORIGIN}/me/tickets/${UUID}?new=1`, ORIGIN)).toBe(`${ORIGIN}/me/tickets/:id`);
    expect(scrubReferrer("", ORIGIN)).toBe("");
  });
});

describe("gaBootstrap", () => {
  it("configures and sends the first page view with scrubbed location and referrer", () => {
    const calls = runBootstrap(`${ORIGIN}/me/tickets/${UUID}?new=1&utm_source=wa#x`, `${ORIGIN}/events/e/register?step=2`);
    const config = calls.find((c) => c[0] === "config")!;
    const pv = calls.find((c) => c[0] === "event" && c[1] === "page_view")!;
    const loc = `${ORIGIN}/me/tickets/:id?utm_source=wa`;
    expect(config).toEqual(["config", "G-TEST123", { send_page_view: false, page_location: loc, page_referrer: `${ORIGIN}/events/e/register` }]);
    expect(pv[2]).toEqual({ page_location: loc, page_referrer: `${ORIGIN}/events/e/register` });
    const all = JSON.stringify(calls);
    expect(all).not.toContain(UUID);
    expect(all).not.toContain("new=1");
    expect(calls.filter((c) => c[1] === "page_view")).toHaveLength(1);
  });
  it("keeps a cross-origin referrer on the first hit", () => {
    const calls = runBootstrap(`${ORIGIN}/`, "https://www.google.com/");
    expect(calls.find((c) => c[0] === "config")![2]).toMatchObject({ page_referrer: "https://www.google.com/" });
  });
  it("matches the TypeScript scrubber", () => {
    for (const href of [`${ORIGIN}/u/x?gclid=1&a=2`, `${ORIGIN}/me/tickets/${UUID.toUpperCase()}`, `${ORIGIN}/?utm_source=a&utm_source=b`]) {
      const config = runBootstrap(href).find((c) => c[0] === "config")!;
      expect((config[2] as { page_location: string }).page_location).toBe(scrubUrl(href));
    }
  });
  it("escapes the id so it can never close the script", () => {
    expect(gaBootstrap("G-1</script><script>alert(1)")).not.toContain("</script>");
  });
});

describe("pageViewStep", () => {
  it("does not double-send on first load", () => {
    expect(pageViewStep(null, `${ORIGIN}/me/tickets/${UUID}?new=1`)).toEqual({ prev: `${ORIGIN}/me/tickets/:id`, hit: null });
  });
  it("ignores a dropped non-allowlisted query (replaceState of ?new=1)", () => {
    expect(pageViewStep(`${ORIGIN}/me/tickets/:id`, `${ORIGIN}/me/tickets/${UUID}`).hit).toBeNull();
  });
  it("sends on navigation and on an allowlisted query change, with the previous page as referrer", () => {
    expect(pageViewStep(`${ORIGIN}/me`, `${ORIGIN}/me/tickets/${UUID}`)).toEqual({
      prev: `${ORIGIN}/me/tickets/:id`,
      hit: { page_location: `${ORIGIN}/me/tickets/:id`, page_referrer: `${ORIGIN}/me` },
    });
    expect(pageViewStep(`${ORIGIN}/`, `${ORIGIN}/?utm_source=wa`).hit).toEqual({
      page_location: `${ORIGIN}/?utm_source=wa`,
      page_referrer: `${ORIGIN}/`,
    });
  });
});
