import { describe, expect, it } from "vitest";
import { externalRegistrationUrl, fallbackFormUrl, safeFormUrl } from "@/lib/registration/external";

describe("safeFormUrl", () => {
  it("keeps https links", () => expect(safeFormUrl("https://forms.gle/abc123")).toBe("https://forms.gle/abc123"));
  it("drops placeholders, http, scripts, credentials and junk", () => {
    expect(safeFormUrl("https://forms.gle/your-form-id")).toBeNull();
    expect(safeFormUrl("http://forms.gle/abc123")).toBeNull();
    expect(safeFormUrl("javascript:alert(1)")).toBeNull();
    expect(safeFormUrl("https://user:pw@evil.example/x")).toBeNull();
    expect(safeFormUrl("")).toBeNull();
  });
  it("tolerates surrounding whitespace but not embedded junk", () => {
    expect(safeFormUrl("  https://forms.gle/abc123 \n")).toBe("https://forms.gle/abc123");
    expect(safeFormUrl("https://")).toBeNull();
    expect(safeFormUrl("//forms.gle/abc123")).toBeNull();
  });
});

describe("externalRegistrationUrl", () => {
  const reg = { mode: "external" as const, googleFormUrl: "https://forms.gle/abc123" };
  it("is the form URL only in external mode", () => {
    expect(externalRegistrationUrl(reg)).toBe("https://forms.gle/abc123");
    expect(externalRegistrationUrl({ ...reg, mode: "onsite" })).toBeNull();
    expect(externalRegistrationUrl({ ...reg, googleFormUrl: "https://forms.gle/your-form-id" })).toBeNull();
  });
  it("fallbackFormUrl ignores the mode", () =>
    expect(fallbackFormUrl({ ...reg, mode: "onsite" })).toBe("https://forms.gle/abc123"));
});
