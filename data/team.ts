import type { TeamMember } from "./types";

// Organising committee. `group` controls which filter tab a person appears under.

export const team: TeamMember[] = [
  { name: "Dr. Lekshmi S.", role: "Branch Counselor", group: "Leadership", funFact: "Has graded 4,000+ lab records and still enjoys it.", links: { linkedin: "https://linkedin.com" } },
  { name: "Aaron Jacob", role: "Chair", group: "Leadership", funFact: "Debugs code by explaining it to his cat, Tensor.", links: { linkedin: "https://linkedin.com", instagram: "https://instagram.com" } },
  { name: "Devika Suresh", role: "Vice Chair", group: "Leadership", funFact: "Can solve a Rubik's cube in under a minute — blindfolded attempts pending.", links: { linkedin: "https://linkedin.com" } },
  { name: "Harikrishnan P.", role: "Secretary", group: "Leadership", funFact: "Keeps a spreadsheet of his spreadsheets.", links: { linkedin: "https://linkedin.com" } },
  { name: "Nandana Rajeev", role: "Treasurer", group: "Leadership", funFact: "Tracks every rupee — and every cup of chai.", links: { linkedin: "https://linkedin.com" } },
  { name: "Aditya Menon", role: "Event Coordinator", group: "Coordinators", funFact: "Has walked every staircase on campus. Counted the steps too.", links: { linkedin: "https://linkedin.com", instagram: "https://instagram.com" } },
  { name: "Fathima Rasheed", role: "Event Coordinator", group: "Coordinators", funFact: "Plans events like heists. Nothing ever goes off-script.", links: { linkedin: "https://linkedin.com" } },
  { name: "Sidharth Unni", role: "Tech Lead", group: "Tech", funFact: "Wrote this site's neural field at 2 a.m. on instant noodles.", links: { github: "https://github.com", linkedin: "https://linkedin.com" } },
  { name: "Gayathri Mohan", role: "Web Developer", group: "Tech", funFact: "Refuses to ship anything without a dark mode.", links: { github: "https://github.com" } },
  { name: "Joel Thomas", role: "Design Lead", group: "Design", funFact: "Has opinions about kerning. Many opinions.", links: { instagram: "https://instagram.com", linkedin: "https://linkedin.com" } },
  { name: "Ann Maria Joseph", role: "Visual Designer", group: "Design", funFact: "Designed the (AI) glyph on a bus ride home.", links: { instagram: "https://instagram.com" } },
  { name: "Rohan George", role: "Media Lead", group: "Media", funFact: "Shoots every event on a phone older than the freshers.", links: { instagram: "https://instagram.com", linkedin: "https://linkedin.com" } },
];

export const teamGroups = ["All", "Leadership", "Coordinators", "Tech", "Design", "Media"] as const;
