import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// fresh module per test: the font cache and the warn-once flag are module state
const load = async () => (await import("@/lib/og-font")).loadGoogleFont;

const css = (url: string) => `@font-face { font-family: 'Anton'; src: url(${url}) format('truetype'); }`;
const ok = (body: string | ArrayBuffer) => new Response(body, { status: 200 });

describe("loadGoogleFont", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.resetModules();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    warn.mockRestore();
  });

  it("fetches the TTF only from fonts.gstatic.com", async () => {
    const fetchMock = vi.fn(async (url: string) => (url.startsWith("https://fonts.googleapis.com/") ? ok(css("https://fonts.gstatic.com/l/font?kit=a")) : ok(new ArrayBuffer(8))));
    vi.stubGlobal("fetch", fetchMock);
    const data = await (await load())("Anton", "AB");
    expect(data?.byteLength).toBe(8);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      "https://fonts.googleapis.com/css2?family=Anton&text=AB",
      "https://fonts.gstatic.com/l/font?kit=a",
    ]);
  });

  it("refuses a font URL on any other host (no second request)", async () => {
    for (const evil of ["https://evil.test/a.ttf", "http://fonts.gstatic.com/a.ttf", "https://fonts.gstatic.com.evil.test/a.ttf"]) {
      vi.resetModules();
      const fetchMock = vi.fn(async () => ok(css(evil)));
      vi.stubGlobal("fetch", fetchMock);
      expect(await (await load())("Anton", "AB")).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("warns once (build log) when fonts can't be loaded, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const loadGoogleFont = await load();
    expect(await loadGoogleFont("Anton", "AB")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await loadGoogleFont("Space Mono:wght@700", "CD")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("built-in font");
  });

  it("does not warn when the font loads", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("googleapis") ? ok(css("https://fonts.gstatic.com/x")) : ok(new ArrayBuffer(4)))));
    expect(await (await load())("Anton", "Z")).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
