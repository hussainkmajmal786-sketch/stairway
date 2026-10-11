import { describe, expect, it } from "vitest";
import { ENTITIES, ENTITY_RULES } from "@/lib/admin/entities";
import { buildEntityData, ENTITY_FIELDS } from "@/lib/admin/entity-fields";

describe("buildEntityData", () => {
  it("nests dotted names and turns empty image/event fields into null", () => {
    const d = buildEntityData(ENTITY_FIELDS.speaker, {
      name: "Asha", slug: "asha", "links.linkedin": "https://l.in/a", photoUrl: "",
    });
    expect(d).toMatchObject({ name: "Asha", photoUrl: null, links: { linkedin: "https://l.in/a", github: "" } });
  });
  it("produces data that the entity schema accepts for blank-but-valid forms", () => {
    const track = buildEntityData(ENTITY_FIELDS.track, { name: "Vision", description: "" });
    expect(ENTITY_RULES.track.schema.safeParse(track).success).toBe(true);
    const gallery = buildEntityData(ENTITY_FIELDS.gallery, {
      imageUrl: "https://x.y/a.png", alt: "A photo", caption: "", ratio: "wide", eventId: "",
    });
    expect(ENTITY_RULES.gallery.schema.safeParse(gallery).success).toBe(true);
  });
  it("every field of every entity maps to a key its schema knows (no silent drops)", () => {
    for (const e of ENTITIES) {
      const data = buildEntityData(ENTITY_FIELDS[e], {});
      const r = ENTITY_RULES[e].schema.safeParse(data);
      // Blank forms may fail validation, but never because of an unknown key.
      if (!r.success) expect(r.error.issues.map((i) => i.code), e).not.toContain("unrecognized_keys");
    }
  });
});
