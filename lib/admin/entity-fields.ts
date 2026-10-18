import type { MediaKind } from "./media";
import type { Entity } from "./entities";

export interface FieldSpec {
  /** Dot path into the data object sent to the action (e.g. `links.linkedin`). */
  name: string;
  label: string;
  kind: "text" | "textarea" | "url" | "select" | "image" | "event" | "number";
  options?: readonly { value: string; label: string }[];
  hint?: string;
  required?: boolean;
  maxLength?: number;
  /** For `image` fields: the upload kind. */
  mediaKind?: MediaKind;
}

const RATIOS = [
  { value: "wide", label: "Wide" },
  { value: "tall", label: "Tall" },
  { value: "square", label: "Square" },
] as const;
const TIER_SIZES = [
  { value: "xl", label: "Extra large" },
  { value: "lg", label: "Large" },
  { value: "md", label: "Medium" },
  { value: "sm", label: "Small" },
] as const;

export const ENTITY_FIELDS: Record<Entity, FieldSpec[]> = {
  track: [
    { name: "name", label: "Track name", kind: "text", required: true, maxLength: 80 },
    { name: "description", label: "Description", kind: "textarea", maxLength: 300 },
  ],
  speaker: [
    { name: "name", label: "Name", kind: "text", required: true, maxLength: 80 },
    { name: "slug", label: "Web address (slug)", kind: "text", required: true, maxLength: 60, hint: "Lowercase letters, digits and dashes." },
    { name: "designation", label: "Designation", kind: "text", maxLength: 100 },
    { name: "organization", label: "Organization", kind: "text", maxLength: 100 },
    { name: "topic", label: "Topic", kind: "text", maxLength: 120 },
    { name: "bio", label: "Bio", kind: "textarea", maxLength: 800 },
    { name: "photoUrl", label: "Photo", kind: "image", mediaKind: "speaker" },
    { name: "links.linkedin", label: "LinkedIn link", kind: "url" },
    { name: "links.github", label: "GitHub link", kind: "url" },
    { name: "links.x", label: "X link", kind: "url" },
    { name: "links.instagram", label: "Instagram link", kind: "url" },
    { name: "links.website", label: "Website", kind: "url" },
  ],
  gallery: [
    { name: "imageUrl", label: "Image", kind: "image", mediaKind: "gallery", required: true },
    { name: "alt", label: "Alt text (describe the photo)", kind: "text", required: true, maxLength: 200 },
    { name: "caption", label: "Caption", kind: "text", maxLength: 140 },
    { name: "ratio", label: "Shape", kind: "select", options: RATIOS, required: true },
    { name: "eventId", label: "Session (optional)", kind: "event" },
  ],
  sponsor: [
    { name: "name", label: "Name", kind: "text", required: true, maxLength: 80 },
    { name: "url", label: "Website", kind: "url" },
    { name: "tier", label: "Tier name", kind: "text", required: true, maxLength: 40, hint: "Sponsors with the same tier name are grouped." },
    { name: "tierSize", label: "Tier size", kind: "select", options: TIER_SIZES, required: true },
    { name: "logoUrl", label: "Logo", kind: "image", mediaKind: "sponsor" },
  ],
  team: [
    { name: "name", label: "Name", kind: "text", required: true, maxLength: 80 },
    { name: "role", label: "Role", kind: "text", required: true, maxLength: 80 },
    { name: "group", label: "Group", kind: "text", required: true, maxLength: 60 },
    { name: "funFact", label: "Fun fact", kind: "text", maxLength: 200 },
    { name: "photoUrl", label: "Photo", kind: "image", mediaKind: "team" },
    { name: "links.linkedin", label: "LinkedIn link", kind: "url" },
    { name: "links.instagram", label: "Instagram link", kind: "url" },
    { name: "links.github", label: "GitHub link", kind: "url" },
  ],
  faq: [
    { name: "question", label: "Question", kind: "text", required: true, maxLength: 200 },
    { name: "answer", label: "Answer", kind: "textarea", required: true, maxLength: 1500 },
  ],
  testimonial: [
    { name: "quote", label: "Quote", kind: "textarea", required: true, maxLength: 400 },
    { name: "name", label: "Name", kind: "text", required: true, maxLength: 80 },
    { name: "detail", label: "Detail (college, year)", kind: "text", maxLength: 120 },
    { name: "stepLabel", label: "Step label", kind: "text", maxLength: 40 },
    { name: "photoUrl", label: "Photo", kind: "image", mediaKind: "team" },
  ],
};

/** Form strings -> the nested object the action validates. Empty image / event fields become null. */
export function buildEntityData(fields: readonly FieldSpec[], values: Readonly<Record<string, string>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.name] ?? "";
    const v: unknown = f.kind === "image" || f.kind === "event" ? (raw === "" ? null : raw) : raw;
    const path = f.name.split(".");
    let cur = out;
    for (let i = 0; i < path.length - 1; i++) {
      const next = cur[path[i]];
      cur = (typeof next === "object" && next !== null ? next : (cur[path[i]] = {})) as Record<string, unknown>;
    }
    cur[path[path.length - 1]] = v;
  }
  return out;
}
