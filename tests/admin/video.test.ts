import { describe, expect, it } from "vitest";
import { parseVideoUrl } from "@/lib/admin/video";

const ID = "dQw4w9WgXcQ";
const YT = `https://www.youtube.com/watch?v=${ID}`;

describe("parseVideoUrl", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, "youtube", YT],
    [`https://youtube.com/watch?v=${ID}`, "youtube", YT],
    [`https://m.youtube.com/watch?v=${ID}&t=30s`, "youtube", YT],
    [`https://www.youtube.com/watch?v=${ID}&si=abc123`, "youtube", YT],
    [`https://youtu.be/${ID}`, "youtube", YT],
    [`https://youtu.be/${ID}?t=12`, "youtube", YT],
    [`https://www.youtube.com/embed/${ID}`, "youtube", YT],
    ["  https://vimeo.com/123456789  ", "vimeo", "https://vimeo.com/123456789"],
    ["https://www.vimeo.com/76979871", "vimeo", "https://vimeo.com/76979871"],
    ["https://cdn.example.org/media/talk.mp4", "direct", "https://cdn.example.org/media/talk.mp4"],
    ["https://abc.supabase.co/storage/v1/object/public/media/societies/x/clip.WEBM", "direct", "https://abc.supabase.co/storage/v1/object/public/media/societies/x/clip.WEBM"],
  ])("accepts %s", (input, kind, url) => {
    expect(parseVideoUrl(input)).toEqual({ kind, url });
  });

  it.each([
    "",
    "   ",
    "not a url",
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    `http://www.youtube.com/watch?v=${ID}`,
    `http://example.com/clip.mp4`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    `https://evil.com/youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&list=PL1234567890`,
    `https://www.youtube.com/playlist?list=PL1234567890`,
    `https://www.youtube.com/embed/${ID}?autoplay=1`,
    `https://www.youtube.com/watch?v=short`,
    `https://www.youtube.com/watch?v=${ID}extra`,
    `https://user:pw@www.youtube.com/watch?v=${ID}`,
    `https://user:pw@cdn.example.org/clip.mp4`,
    "https://cdn.example.org:8443/clip.mp4",
    "https://vimeo.com/channels/staffpicks/123456",
    "https://vimeo.com/abc",
    "https://vimeo.com/123456789?autoplay=1",
    "https://cdn.example.org/clip.mp4.exe",
    "https://cdn.example.org/clip.html",
    "https://xn--yutube-9ya.com/watch?v=dQw4w9WgXcQ",
    "https://yоutube.com/watch?v=dQw4w9WgXcQ",
    `https://cdn.example.org/${"a".repeat(500)}.mp4`,
    "ftp://example.org/clip.mp4",
  ])("rejects %j", (input) => {
    expect(parseVideoUrl(input)).toBeNull();
  });

  it("is not fooled by non-string input", () => {
    expect(parseVideoUrl(undefined as unknown as string)).toBeNull();
  });
});
