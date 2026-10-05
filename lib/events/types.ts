export type SocietyColor = "yellow" | "blue" | "green" | "red" | "orange" | "purple";
export type EventStatus = "completed" | "next" | "upcoming";

export interface TrackView {
  id: string;
  name: string;
  description: string;
}

export interface SocietyView {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  color: SocietyColor;
  logoUrl: string | null;
  tracks: TrackView[];
}

export interface EventResources {
  slides?: string;
  code?: string;
  notebook?: string;
  recording?: string;
  reading?: { label: string; href: string }[];
}

export interface AgendaItem {
  time: string;
  title: string;
  detail?: string;
}

export interface EventView {
  id: string;
  slug: string;
  step: number;
  title: string;
  topic: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  venue: string;
  mode: "offline" | "online" | "hybrid";
  posterUrl: string | null;
  videoUrl: string | null;
  level: string;
  formats: string[];
  agenda: AgendaItem[];
  outcomes: string[];
  prerequisites: string[];
  bring: string[];
  seatsTotal: number;
  seatsFilled: number;
  pricePaise: number;
  ticketType: "qr" | "token";
  tokenPrefix: string;
  isFinale: boolean;
  speakerIds: string[];
  resources: EventResources;
  winners: { place: string; team: string; project: string }[];
  society: Pick<SocietyView, "id" | "slug" | "name" | "shortName" | "color">;
  trackName: string | null;
}

export interface EventWithStatus extends EventView {
  status: EventStatus;
  seatsLeft: number;
}
