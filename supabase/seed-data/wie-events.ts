import type { Weekend } from "@/data/types";

export type WieEvent = Omit<Weekend, "track" | "seatsFilled" | "statusOverride"> & { trackName: string };

const day = (title: string, lab: string) => [
  { time: "09:30", title: "Check-in & coffee" },
  { time: "10:00", title },
  { time: "11:45", title: "Guided walkthrough" },
  { time: "13:00", title: "Lunch" },
  { time: "14:00", title: lab, detail: "Work in pairs. Mentors float between tables." },
  { time: "16:00", title: "Show & tell and wrap-up" },
];

export const WIE_EVENTS: WieEvent[] = [
  {
    step: 1, slug: "wie-ai-healthtech", title: "Code Her Way: AI in HealthTech", topic: "Medical data, diagnosis models and ethics",
    trackName: "AI × HealthTech", start: "2026-10-17T09:30:00+05:30", end: "2026-10-17T16:30:00+05:30",
    level: "Beginner", formats: ["Workshop"],
    summary: "Build a small diagnostic model on open health data and learn where AI helps — and where it must not decide alone.",
    description: "Start with how hospitals actually use AI today, then train a simple classifier on an open medical dataset and examine its mistakes. We close with the questions every health-AI builder must answer: consent, bias and accountability.",
    outcomes: ["Explain common uses of AI in healthcare", "Train and evaluate a simple diagnostic classifier", "Spot bias in a medical dataset", "Apply a responsible-AI checklist to a health project"],
    prerequisites: ["None — beginners welcome"], bring: ["Laptop and charger", "A Google account for Colab"],
    agenda: day("Talk: AI in Indian healthcare today", "Diagnose-with-data lab"),
    speakerIds: ["meera-krishnan"], seatsTotal: 60,
  },
  {
    step: 2, slug: "wie-designing-ai-for-everyone", title: "Designing AI for Everyone", topic: "Accessible, inclusive AI products",
    trackName: "AI × Inclusive Design", start: "2026-10-31T09:30:00+05:30", end: "2026-10-31T16:30:00+05:30",
    level: "Beginner", formats: ["Workshop"],
    summary: "Make AI products that work for people the tutorials forget — accessibility, language and context.",
    description: "Explore how voice assistants, captioning and recommendation systems fail different users, then redesign an AI feature with accessibility and local-language users in mind. Hands-on with speech and vision APIs.",
    outcomes: ["Audit an AI feature for accessibility gaps", "Prototype an inclusive AI interaction", "Use speech and vision APIs in a small demo"],
    prerequisites: ["None"], bring: ["Laptop and charger"],
    agenda: day("Talk: Who does AI leave out?", "Redesign-an-AI-feature sprint"),
    speakerIds: ["sneha-thomas"], seatsTotal: 60,
  },
  {
    step: 3, slug: "wie-ai-for-good", title: "AI for Good: Social Impact Sprint", topic: "Solving local problems with AI",
    trackName: "AI × Social Impact", start: "2026-11-14T09:30:00+05:30", end: "2026-11-14T17:00:00+05:30",
    level: "Intermediate", formats: ["Competition"],
    summary: "A one-day build sprint on real problems from Kottayam — water, transport, safety and education.",
    description: "Teams of two to four pick a local problem statement, find data, and prototype an AI-assisted solution in a day. Mentors help scope; a jury picks three teams to present at the next WIE session.",
    outcomes: ["Scope a social-impact problem for AI", "Prototype a working demo in a day", "Pitch the impact and limits of your solution"],
    prerequisites: ["Basic Python", "Teams of 2–4 (solo sign-ups get matched)"], bring: ["Laptop and charger", "Your team"],
    agenda: [
      { time: "09:30", title: "Problem statements & team formation" },
      { time: "10:30", title: "Build sprint begins" },
      { time: "13:00", title: "Lunch + mentor round" },
      { time: "15:30", title: "Demos" },
      { time: "16:30", title: "Jury results" },
    ],
    speakerIds: ["anjali-nair"], seatsTotal: 80,
  },
  {
    step: 4, slug: "wie-lead-with-ai", title: "Lead with AI: Founders & Leaders Panel", topic: "Careers, startups and leadership in AI",
    trackName: "AI × Entrepreneurship & Leadership", start: "2026-11-28T10:00:00+05:30", end: "2026-11-28T15:00:00+05:30",
    level: "All levels", formats: ["Panel", "Talk"],
    summary: "Women founders and engineering leaders on building careers and companies in AI.",
    description: "An afternoon of honest conversations: getting your first AI role, starting up from Kerala, leading technical teams and negotiating your worth. Speed-mentoring tables close the day.",
    outcomes: ["Map career paths into AI", "Learn how founders validate AI startup ideas", "Get one-to-one advice at mentoring tables"],
    prerequisites: ["None"], bring: ["Questions", "Your CV if you want feedback"],
    agenda: [
      { time: "10:00", title: "Opening keynote" },
      { time: "10:45", title: "Panel: Building a career in AI" },
      { time: "12:15", title: "Lunch" },
      { time: "13:15", title: "Speed-mentoring tables" },
      { time: "14:30", title: "Closing & next steps" },
    ],
    speakerIds: ["anjali-nair", "meera-krishnan", "sneha-thomas"], seatsTotal: 120,
  },
];
