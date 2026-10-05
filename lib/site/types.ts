import type { EventView, SocietyView } from "@/lib/events/types";
import type { Settings } from "./schema";

export interface SpeakerView {
  id: string;
  name: string;
  designation: string;
  organization: string;
  photo?: string;
  bio: string;
  topic: string;
  links: { linkedin?: string; x?: string; website?: string };
}
export interface SponsorTierView {
  tier: string;
  size: "xl" | "lg" | "md" | "sm";
  sponsors: { name: string; url: string; logo?: string }[];
}
export interface TeamMemberView {
  name: string;
  role: string;
  group: string;
  photo?: string;
  funFact: string;
  links: { linkedin?: string; instagram?: string; github?: string };
}
export interface FaqView { q: string; a: string }
export interface TestimonialView { quote: string; name: string; detail: string; step: string; photo?: string }
export interface GalleryItemView {
  id: string;
  eventSlug: string | null;
  eventTitle: string | null;
  step: number | null;
  caption: string;
  alt: string;
  src?: string;
  ratio: "tall" | "wide" | "square";
}

export interface SiteData {
  settings: Settings;
  stats: { label: string; value: number; suffix: string }[];
  societies: SocietyView[];
  events: EventView[];
  speakers: SpeakerView[];
  sponsors: SponsorTierView[];
  team: TeamMemberView[];
  faqs: FaqView[];
  testimonials: TestimonialView[];
  gallery: GalleryItemView[];
}
