// Shared content types for everything in /data.

export type Level = "Beginner" | "Intermediate" | "Advanced" | "Expert" | "All levels";
export type Format =
  | "Talk"
  | "Workshop"
  | "Lab"
  | "Competition"
  | "Hackathon"
  | "Panel"
  | "Hands-on";
export type WeekendStatus = "completed" | "next" | "upcoming";

export interface AgendaItem {
  time: string; // "09:30"
  title: string;
  detail?: string;
}

export interface WeekendResources {
  slides?: string;
  code?: string;
  notebook?: string;
  recording?: string; // YouTube embed URL
  reading?: { label: string; href: string }[];
}

export interface Weekend {
  step: number;
  slug: string;
  title: string;
  topic: string;
  /** ISO 8601 with offset, e.g. "2026-10-10T09:30:00+05:30" */
  start: string;
  end: string;
  level: Level;
  formats: Format[];
  track: TrackId;
  summary: string; // ~2 lines, shown on cards
  description: string;
  outcomes: string[];
  prerequisites: string[];
  bring: string[];
  agenda: AgendaItem[];
  speakerIds: string[];
  seatsTotal: number;
  seatsFilled: number;
  resources?: WeekendResources;
  gallery?: string[]; // gallery item ids
  winners?: { place: string; team: string; project: string }[];
  /** Optional manual override. Normally status is computed from dates. */
  statusOverride?: WeekendStatus;
}

export type TrackId = "explorer" | "builder" | "innovator" | "summit";

export interface Speaker {
  id: string;
  name: string;
  designation: string;
  organization: string;
  photo?: string; // put files in /public/speakers and reference "/speakers/name.webp"
  bio: string;
  topic: string;
  links: { linkedin?: string; x?: string; website?: string };
}

export interface TeamMember {
  name: string;
  role: string;
  group: "Leadership" | "Coordinators" | "Tech" | "Design" | "Media";
  photo?: string;
  funFact: string;
  links: { linkedin?: string; instagram?: string; github?: string };
}
