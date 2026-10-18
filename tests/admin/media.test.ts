import { describe, expect, it } from "vitest";
import { checkUpload, isOwnMediaUrl, MEDIA_LIMITS, mediaPath } from "@/lib/admin/media";

const SOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RAND = "0123456789abcdef0123456789abcdef";
const SUPA = "https://proj.supabase.co";
const PREFIX = `societies/${SOC}/events/${EV}/`;
const url = (p: string) => `${SUPA}/storage/v1/object/public/media/${p}`;

describe("MEDIA_LIMITS / checkUpload", () => {
  it("never allows svg or html", () => {
    for (const limit of Object.values(MEDIA_LIMITS)) {
      expect(limit.mimes.some((m) => /svg|html|javascript|pdf/.test(m))).toBe(false);
    }
    expect(checkUpload("poster", "image/svg+xml", 100)).not.toBeNull();
    expect(checkUpload("poster", "text/html", 100)).not.toBeNull();
  });
  it("accepts images up to 5 MB and rejects more", () => {
    expect(checkUpload("poster", "image/jpeg", 5 * 1024 * 1024)).toBeNull();
    expect(checkUpload("poster", "image/jpeg", 5 * 1024 * 1024 + 1)).toMatch(/too large/);
    expect(checkUpload("poster", "image/png", 0)).not.toBeNull();
    expect(checkUpload("poster", "image/png", Number.NaN)).not.toBeNull();
  });
  it("keeps video separate from images", () => {
    expect(checkUpload("video", "video/mp4", 50 * 1024 * 1024)).toBeNull();
    expect(checkUpload("video", "image/png", 10)).not.toBeNull();
    expect(checkUpload("poster", "video/mp4", 10)).not.toBeNull();
  });
});

describe("mediaPath", () => {
  it("builds event, society and site paths with an extension derived from the MIME", () => {
    expect(mediaPath({ scope: { societyId: SOC, eventId: EV }, kind: "poster", mime: "image/jpeg", rand: RAND })).toBe(
      `societies/${SOC}/events/${EV}/poster-${RAND}.jpg`,
    );
    expect(mediaPath({ scope: { societyId: SOC }, kind: "logo", mime: "image/png", rand: RAND })).toBe(`societies/${SOC}/logo-${RAND}.png`);
    expect(mediaPath({ scope: { site: true }, kind: "sponsor", mime: "image/webp", rand: RAND })).toBe(`site/sponsor-${RAND}.webp`);
  });
  it("refuses unknown MIME types, bad random ids and non-uuid folders", () => {
    expect(() => mediaPath({ scope: { site: true }, kind: "poster", mime: "image/svg+xml", rand: RAND })).toThrow();
    expect(() => mediaPath({ scope: { site: true }, kind: "poster", mime: "image/png", rand: "../../x" })).toThrow();
    expect(() => mediaPath({ scope: { societyId: "../evil" }, kind: "poster", mime: "image/png", rand: RAND })).toThrow();
    expect(() => mediaPath({ scope: { societyId: SOC, eventId: "x/../y" }, kind: "poster", mime: "image/png", rand: RAND })).toThrow();
  });
  it("never contains traversal", () => {
    const p = mediaPath({ scope: { societyId: SOC, eventId: EV }, kind: "gallery", mime: "image/avif", rand: RAND });
    expect(p).not.toContain("..");
    expect(p.startsWith(PREFIX)).toBe(true);
  });
});

describe("isOwnMediaUrl", () => {
  const good = url(`${PREFIX}poster-${RAND}.jpg`);
  it("accepts a file in the allowed folder of this project", () => {
    expect(isOwnMediaUrl(good, SUPA, PREFIX)).toBe(true);
  });
  it.each([
    ["another host", `https://evil.example/storage/v1/object/public/media/${PREFIX}poster.jpg`],
    ["a lookalike host", `https://proj.supabase.co.evil.com/storage/v1/object/public/media/${PREFIX}poster.jpg`],
    ["http", `http://proj.supabase.co/storage/v1/object/public/media/${PREFIX}poster.jpg`],
    ["another society's folder", url(`societies/${OTHER}/events/${EV}/poster.jpg`)],
    ["another event in the same society", url(`societies/${SOC}/events/dddddddd-dddd-4ddd-8ddd-dddddddddddd/poster.jpg`)],
    ["a nested folder", url(`${PREFIX}sub/poster.jpg`)],
    ["parent traversal", url(`${PREFIX}../poster.jpg`)],
    ["encoded traversal", url(`${PREFIX}..%2fposter.jpg`)],
    ["encoded dot traversal", url(`${PREFIX}%2e%2e/poster.jpg`)],
    ["userinfo trick", `https://evil@proj.supabase.co/storage/v1/object/public/media/${PREFIX}poster.jpg`],
    ["a query", `${good}?x=1`],
    ["a fragment", `${good}#x`],
    ["the bucket root", url("")],
    ["a private path", `${SUPA}/storage/v1/object/media/${PREFIX}poster.jpg`],
    ["empty", ""],
  ])("rejects %s", (_n, input) => {
    expect(isOwnMediaUrl(input, SUPA, PREFIX)).toBe(false);
  });
  it("rejects a malformed project URL", () => {
    expect(isOwnMediaUrl(good, "not a url", PREFIX)).toBe(false);
  });
});
