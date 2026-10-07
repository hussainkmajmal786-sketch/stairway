import { describe, expect, it } from "vitest";
import { fieldIdFor, registrationFieldErrors, registrationSchema, type Registrant } from "@/lib/registration/schema";
import type { Question } from "@/lib/registration/questions";

const QS: Question[] = [{ id: "laptop", label: "Laptop?", type: "single_choice", options: ["Yes", "No"], required: true }];
const me: Registrant = {
  fullName: "Ada Lovelace", college: "CEK", branch: "Civil", year: "1st year", phone: "9876543210", ieeeMemberId: "",
};

describe("registrationSchema", () => {
  const s = registrationSchema(QS);
  it("accepts a complete registration", () =>
    expect(s.safeParse({ registrant: me, answers: { laptop: "Yes" } }).success).toBe(true));
  it("requires a phone number and validates the IEEE id", () => {
    expect(s.safeParse({ registrant: { ...me, phone: "" }, answers: { laptop: "Yes" } }).success).toBe(false);
    expect(s.safeParse({ registrant: { ...me, ieeeMemberId: "123" }, answers: { laptop: "Yes" } }).success).toBe(false);
    expect(s.safeParse({ registrant: { ...me, ieeeMemberId: "12345678" }, answers: { laptop: "Yes" } }).success).toBe(true);
  });
  it("only accepts listed branches and years", () =>
    expect(s.safeParse({ registrant: { ...me, branch: "Astrology" }, answers: { laptop: "Yes" } }).success).toBe(false));
  it("accepts common phone formats and trims them", () => {
    for (const phone of ["+91 98765 43210", "+91-98765-43210", "98765 43210", " 9876543210 "]) {
      expect(s.safeParse({ registrant: { ...me, phone }, answers: { laptop: "Yes" } }).success).toBe(true);
    }
    expect(s.parse({ registrant: { ...me, phone: " 9876543210\n" }, answers: { laptop: "Yes" } }).registrant.phone)
      .toBe("9876543210");
  });
  it("only allows ASCII space or - as phone separators (stricter than the DB's \\s)", () => {
    expect(s.safeParse({ registrant: { ...me, phone: "98765 43210" }, answers: { laptop: "Yes" } }).success).toBe(false);
    expect(s.safeParse({ registrant: { ...me, phone: "5876543210" }, answers: { laptop: "Yes" } }).success).toBe(false);
  });
});

describe("field ids", () => {
  it("maps schema paths to form element ids", () => {
    expect(fieldIdFor(["registrant", "phone"])).toBe("phone");
    expect(fieldIdFor(["answers", "laptop"])).toBe("q-laptop");
    expect(fieldIdFor(["answers"])).toBe("form");
    expect(fieldIdFor([])).toBe("form");
  });
  it("collects the first message per field", () => {
    const r = registrationSchema(QS).safeParse({ registrant: { ...me, phone: "1" }, answers: {} });
    expect(r.success).toBe(false);
    const errs = registrationFieldErrors(r.error!);
    expect(errs.phone).toBe("Use a 10-digit Indian mobile number.");
    expect(errs["q-laptop"]).toBeTruthy();
  });
});
