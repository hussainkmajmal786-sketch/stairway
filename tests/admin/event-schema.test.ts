import { describe, expect, it } from "vitest";
import {
  copySlug, copyTitle, EventFieldsSchema, EventInputSchema, formValuesToFields, isoToIstLocal, istLocalToIso,
  nextStepNumber, paiseToRupees, publishBlockers, rupeesToPaise, slugify, type EventFormValues,
} from "@/lib/admin/event-schema";

const SOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const base = {
  trackId: null,
  step: 4,
  slug: "intro-to-rag",
  title: "Intro to RAG",
  topic: "Retrieval",
  summary: "",
  description: "",
  startsAt: "2026-11-14T10:00:00+05:30",
  endsAt: "2026-11-14T13:00:00+05:30",
  venue: "Seminar hall",
  mode: "offline",
  level: "All levels",
  formats: ["Workshop"],
  capacity: 60,
  pricePaise: 19900,
  ticketType: "qr",
  tokenPrefix: "",
  registrationOpensAt: null,
  registrationClosesAt: null,
  isFinale: false,
};
const fieldErrors = (input: unknown) => {
  const r = EventFieldsSchema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("EventFieldsSchema", () => {
  it("accepts a valid event", () => {
    expect(EventFieldsSchema.safeParse(base).success).toBe(true);
  });
  it.each([
    ["a", false], ["ab", true], ["Upper", false], ["has space", false], ["a_b", false], ["x".repeat(80), true], ["x".repeat(81), false],
  ])("slug %j valid=%s", (slug, ok) => {
    expect(EventFieldsSchema.safeParse({ ...base, slug }).success).toBe(ok);
  });
  it.each([
    ["", true], ["IEEE-26", true], ["ieee", false], ["A".repeat(16), true], ["A".repeat(17), false], ["A B", false],
  ])("token prefix %j valid=%s", (tokenPrefix, ok) => {
    expect(EventFieldsSchema.safeParse({ ...base, tokenPrefix }).success).toBe(ok);
  });
  it("rejects end <= start", () => {
    expect(fieldErrors({ ...base, endsAt: base.startsAt }).endsAt).toBeDefined();
    expect(fieldErrors({ ...base, endsAt: "2026-11-14T09:00:00+05:30" }).endsAt).toBeDefined();
  });
  it("requires a venue unless online", () => {
    expect(fieldErrors({ ...base, venue: "" }).venue).toBeDefined();
    expect(fieldErrors({ ...base, venue: "", mode: "hybrid" }).venue).toBeDefined();
    expect(fieldErrors({ ...base, venue: "", mode: "online" }).venue).toBeUndefined();
  });
  it("orders the registration window and keeps it before the end", () => {
    const ok = { registrationOpensAt: "2026-11-01T10:00:00+05:30", registrationClosesAt: "2026-11-13T10:00:00+05:30" };
    expect(EventFieldsSchema.safeParse({ ...base, ...ok }).success).toBe(true);
    expect(fieldErrors({ ...base, registrationOpensAt: ok.registrationClosesAt, registrationClosesAt: ok.registrationOpensAt }).registrationClosesAt).toBeDefined();
    expect(fieldErrors({ ...base, registrationClosesAt: "2026-11-15T10:00:00+05:30" }).registrationClosesAt).toBeDefined();
  });
  it("rejects unknown keys, bad enums, limits and non-offset timestamps", () => {
    expect(EventFieldsSchema.safeParse({ ...base, societyId: SOC }).success).toBe(false);
    expect(EventFieldsSchema.safeParse({ ...base, status: "published" }).success).toBe(false);
    expect(EventFieldsSchema.safeParse({ ...base, level: "Godlike" }).success).toBe(false);
    expect(EventFieldsSchema.safeParse({ ...base, capacity: 5001 }).success).toBe(false);
    expect(EventFieldsSchema.safeParse({ ...base, capacity: -1 }).success).toBe(false);
    expect(EventFieldsSchema.safeParse({ ...base, pricePaise: 1_000_001 }).success).toBe(false);
    expect(EventFieldsSchema.safeParse({ ...base, pricePaise: 10.5 }).success).toBe(false);
    expect(EventFieldsSchema.safeParse({ ...base, step: 0 }).success).toBe(false);
    expect(EventFieldsSchema.safeParse({ ...base, formats: Array(9).fill("x") }).success).toBe(false);
    expect(EventFieldsSchema.safeParse({ ...base, startsAt: "2026-11-14T10:00:00" }).success).toBe(false);
    expect(EventFieldsSchema.safeParse({ ...base, title: "ab" }).success).toBe(false);
  });
});

describe("EventInputSchema", () => {
  it("requires a society uuid", () => {
    expect(EventInputSchema.safeParse({ ...base, societyId: SOC }).success).toBe(true);
    expect(EventInputSchema.safeParse(base).success).toBe(false);
    expect(EventInputSchema.safeParse({ ...base, societyId: "ras" }).success).toBe(false);
  });
});

describe("rupeesToPaise / paiseToRupees", () => {
  it.each([
    ["0", 0], ["199", 19900], ["199.5", 19950], ["199.50", 19950], [" 50 ", 5000], ["0.05", 5], ["999999", 99999900],
    ["199.505", null], ["-1", null], ["1e3", null], ["", null], ["1,000", null], ["1000000", null], ["abc", null], [".5", null],
  ])("%j -> %s", (input, out) => {
    expect(rupeesToPaise(input)).toBe(out);
  });
  it("formats paise", () => {
    expect(paiseToRupees(19900)).toBe("199");
    expect(paiseToRupees(19950)).toBe("199.50");
    expect(paiseToRupees(5)).toBe("0.05");
    expect(paiseToRupees(-1)).toBe("");
  });
});

describe("IST helpers", () => {
  it("converts local to ISO with the IST offset", () => {
    expect(istLocalToIso("2026-11-14T10:00")).toBe("2026-11-14T10:00:00+05:30");
    expect(istLocalToIso("2026-11-14T10:00:30")).toBe("2026-11-14T10:00:30+05:30");
    expect(istLocalToIso("")).toBe("");
    expect(istLocalToIso("not a date")).toBe("");
    expect(istLocalToIso("2026-13-45T10:00")).toBe("");
  });
  it("round-trips across a date line", () => {
    for (const local of ["2026-11-14T10:00", "2026-11-14T00:30", "2026-12-31T23:45", "2026-01-01T02:00"]) {
      expect(isoToIstLocal(istLocalToIso(local))).toBe(local);
    }
    // 20:00 UTC on the 13th is 01:30 IST on the 14th
    expect(isoToIstLocal("2026-11-13T20:00:00Z")).toBe("2026-11-14T01:30");
    expect(isoToIstLocal("garbage")).toBe("");
  });
});

describe("slug / step helpers", () => {
  it("slugifies", () => {
    expect(slugify("Intro to RAG & Agents!")).toBe("intro-to-rag-agents");
    expect(slugify("  Café  Society 2026 ")).toBe("cafe-society-2026");
    expect(slugify("***")).toBe("");
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(80);
  });
  it("builds copy slugs inside the limit", () => {
    expect(copySlug("intro", 0)).toBe("intro-copy");
    expect(copySlug("intro", 1)).toBe("intro-copy-2");
    expect(copySlug("x".repeat(80), 0)).toHaveLength(80);
    expect(/^[a-z0-9-]{2,80}$/.test(copySlug("x".repeat(80), 3))).toBe(true);
  });
  it("finds the next step", () => {
    expect(nextStepNumber([])).toBe(1);
    expect(nextStepNumber([1, 5, 3])).toBe(6);
  });
  it("copies titles within 120 characters", () => {
    expect(copyTitle("Intro")).toBe("Intro (copy)");
    expect(copyTitle("x".repeat(150))).toHaveLength(120);
  });
});

describe("publishBlockers", () => {
  const now = Date.parse("2026-10-11T00:00:00Z");
  const ok = { title: "Intro", topic: "RAG", venue: "Hall", mode: "offline", capacity: 10, startsAt: "2026-11-14T10:00:00+05:30", ticketType: "qr", tokenPrefix: "" };
  it("is empty for a publishable event", () => {
    expect(publishBlockers(ok, now)).toEqual([]);
  });
  it("lists each problem", () => {
    expect(publishBlockers({ ...ok, topic: " " }, now)).toHaveLength(1);
    expect(publishBlockers({ ...ok, venue: "" }, now)).toHaveLength(1);
    expect(publishBlockers({ ...ok, venue: "", mode: "online" }, now)).toEqual([]);
    expect(publishBlockers({ ...ok, capacity: 0 }, now)).toHaveLength(1);
    expect(publishBlockers({ ...ok, startsAt: "2026-09-01T10:00:00+05:30" }, now)).toHaveLength(1);
    expect(publishBlockers({ ...ok, ticketType: "token" }, now)).toHaveLength(1);
    expect(publishBlockers({ ...ok, ticketType: "token", tokenPrefix: "IEEE" }, now)).toEqual([]);
    expect(publishBlockers({ ...ok, title: "", topic: "", capacity: 0 }, now).length).toBe(3);
  });
});

describe("formValuesToFields", () => {
  const values: EventFormValues = {
    trackId: "", step: "4", slug: " intro ", title: "Intro", topic: "T", summary: "", description: "", startsLocal: "2026-11-14T10:00",
    endsLocal: "2026-11-14T13:00", venue: "Hall", mode: "offline", level: "All levels", formats: "Workshop, Talk ,", capacity: "60",
    priceRupees: "199.50", ticketType: "token", tokenPrefix: "ieee", regOpensLocal: "", regClosesLocal: "2026-11-13T10:00", isFinale: false,
  };
  it("builds schema-valid fields", () => {
    const f = formValuesToFields(values);
    expect(f).toMatchObject({ trackId: null, step: 4, slug: "intro", formats: ["Workshop", "Talk"], capacity: 60, pricePaise: 19950, tokenPrefix: "IEEE", registrationOpensAt: null, registrationClosesAt: "2026-11-13T10:00:00+05:30" });
    expect(EventFieldsSchema.safeParse(f).success).toBe(true);
  });
  it("turns malformed numbers and dates into null so the schema reports the field", () => {
    const f = formValuesToFields({ ...values, capacity: "1e3", priceRupees: "1.999", startsLocal: "" });
    expect(f).toMatchObject({ capacity: null, pricePaise: null, startsAt: null });
    expect(EventFieldsSchema.safeParse(f).success).toBe(false);
  });
});
