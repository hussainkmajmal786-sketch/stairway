// ─────────────────────────────────────────────────────────────
// Global event settings. Edit this file to change names, links,
// contact details and registration behaviour across the site.
// ─────────────────────────────────────────────────────────────

export const event = {
  name: "st(AI)rway",
  tagline: "Climb into the future of AI, one weekend at a time.",
  supportLine: "A weekend AI event series by IEEE SB College of Engineering Kidangoor.",
  altTaglines: [
    "Every weekend, one step higher.",
    "From zero to AI builder.",
    "Your next step is waiting.",
    "The stairway doesn't climb itself.",
  ],
  description:
    "Climb into the future of AI, one weekend at a time. Workshops, talks, labs and a hackathon by IEEE Student Branch, College of Engineering Kidangoor.",

  // Used for canonical URLs, sitemap and OG images. No trailing slash.
  siteUrl: "https://stairway.ieeesbcek.workers.dev",

  organizer: {
    name: "IEEE Student Branch, College of Engineering Kidangoor",
    short: "IEEE SB CEK",
    url: "https://ieeesbcek.org",
  },

  venue: {
    name: "College of Engineering Kidangoor",
    hall: "Main Seminar Hall, Block A",
    address: "Kidangoor South P.O., Kottayam, Kerala 686583, India",
    city: "Kottayam",
    region: "Kerala",
    country: "IN",
    postalCode: "686583",
    // Google Maps embed (Share → Embed a map → copy the src URL)
    mapEmbed:
      "https://www.google.com/maps?q=College+of+Engineering+Kidangoor&output=embed",
    mapLink: "https://maps.google.com/?q=College+of+Engineering+Kidangoor",
  },

  registration: {
    // "onsite"  → Register buttons open each session's own page, /events/<slug>/register.
    // "external" → Register buttons go straight to `googleFormUrl`.
    mode: "onsite" as "onsite" | "external",
    googleFormUrl: "https://forms.gle/your-form-id",
  },

  newsletter: {
    // POST endpoint that accepts { email }. Leave empty for demo mode.
    endpoint: "",
  },

  // Google Analytics 4 measurement ID, e.g. "G-XXXXXXX". Empty = off.
  gaId: "",

  announcement: {
    enabled: true,
    // {step} and {title} are replaced with the next weekend's details.
    text: "Registrations open for Step {step}: {title} — limited seats!",
  },

  aftermovieUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  // Put your PDF in /public (e.g. "/sponsorship-deck.pdf"). Empty = the
  // button becomes "Request the deck" and opens an email instead.
  sponsorDeckUrl: "",
  speakerFormUrl: "https://forms.gle/speak-at-stairway",
  volunteerFormUrl: "https://forms.gle/volunteer-stairway",

  contact: {
    email: "stairway@ieeesbcek.org",
    sponsorEmail: "sponsors@ieeesbcek.org",
    coordinators: [
      { name: "Aditya Menon", role: "Event Coordinator", phone: "+91 94470 12345" },
      { name: "Fathima Rasheed", role: "Event Coordinator", phone: "+91 96330 67890" },
    ],
  },

  social: {
    instagram: "https://instagram.com/ieeesbcek",
    linkedin: "https://linkedin.com/company/ieee-sb-cek",
    whatsapp: "https://chat.whatsapp.com/your-community-invite",
    youtube: "https://youtube.com/@ieeesbcek",
    github: "https://github.com/ieeesbcek",
  },

  ieee: {
    joinUrl: "https://www.ieee.org/membership/join/index.html",
    branchUrl: "https://ieeesbcek.org",
  },
} as const;

export type EventConfig = typeof event;
