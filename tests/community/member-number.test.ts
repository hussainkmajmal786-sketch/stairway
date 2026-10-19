import { describe, expect, it } from "vitest";
import { MemberNumberSchema, OptionalMemberNumberSchema, normalizeMemberNumber } from "@/lib/community/member-number";

describe("normalizeMemberNumber", () => {
  it("keeps 8 digits and pads 7 with a leading zero", () => {
    expect(normalizeMemberNumber("01234567")).toBe("01234567");
    expect(normalizeMemberNumber("12345678")).toBe("12345678");
    expect(normalizeMemberNumber("1234567")).toBe("01234567");
    expect(normalizeMemberNumber("  1234567 ")).toBe("01234567");
  });
  it("keeps 9 digits unpadded and strips spaces and hyphens", () => {
    expect(normalizeMemberNumber("101809133")).toBe("101809133");
    expect(normalizeMemberNumber(" 1018-0913 3")).toBe("101809133");
    expect(normalizeMemberNumber("0123 4567")).toBe("01234567");
  });
  it("rejects other lengths and non-digits", () => {
    for (const bad of ["", "12345", "123456", "1234567890", "12ab5678", "1234567a", "١٢٣٤٥٦٧٨", "1234567\n8", "+1234567"]) {
      expect(normalizeMemberNumber(bad)).toBeNull();
    }
  });
});

describe("schemas", () => {
  it("MemberNumberSchema outputs the 8-digit form", () => {
    expect(MemberNumberSchema.parse(" 1234567 ")).toBe("01234567");
    expect(MemberNumberSchema.parse("101809133")).toBe("101809133");
    expect(MemberNumberSchema.safeParse("12345").success).toBe(false);
  });
  it("OptionalMemberNumberSchema allows empty", () => {
    expect(OptionalMemberNumberSchema.parse("")).toBe("");
    expect(OptionalMemberNumberSchema.parse("1234567")).toBe("01234567");
    expect(OptionalMemberNumberSchema.parse("101809133")).toBe("101809133");
    expect(OptionalMemberNumberSchema.safeParse("1234567890").success).toBe(false);
    expect(OptionalMemberNumberSchema.safeParse("12ab").success).toBe(false);
  });
});
