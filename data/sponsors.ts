// Sponsors by tier. Add `logo: "/sponsors/name.svg"` to use an image;
// without one, the name is rendered as a wordmark.

export interface Sponsor {
  name: string;
  url: string;
  logo?: string;
}

export interface SponsorTier {
  tier: string;
  size: "xl" | "lg" | "md" | "sm";
  sponsors: Sponsor[];
}

export const sponsorTiers: SponsorTier[] = [
  { tier: "Title Sponsor", size: "xl", sponsors: [{ name: "Nimbus Labs", url: "https://example.com" }] },
  {
    tier: "Gold",
    size: "lg",
    sponsors: [
      { name: "Monsoon AI", url: "https://example.com" },
      { name: "Edgeworks Robotics", url: "https://example.com" },
    ],
  },
  {
    tier: "Silver",
    size: "md",
    sponsors: [
      { name: "Backwater Analytics", url: "https://example.com" },
      { name: "AgentForge", url: "https://example.com" },
      { name: "Kottayam Cloud", url: "https://example.com" },
    ],
  },
  {
    tier: "Community Partners",
    size: "sm",
    sponsors: [
      { name: "IEEE Kerala Section", url: "https://ieeekerala.org" },
      { name: "TinkerHub CEK", url: "https://example.com" },
      { name: "GDG Kottayam", url: "https://example.com" },
      { name: "Kerala AI Collective", url: "https://example.com" },
    ],
  },
  {
    tier: "Media Partners",
    size: "sm",
    sponsors: [
      { name: "Campus Pulse", url: "https://example.com" },
      { name: "TechKerala Weekly", url: "https://example.com" },
    ],
  },
];
