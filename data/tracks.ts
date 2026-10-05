export type TrackId = "explorer" | "builder" | "innovator" | "summit";

// Learning tracks. Events are grouped into these by level (see components/sections/Tracks.tsx).

export interface Track {
  id: TrackId;
  name: string;
  level: string;
  tagline: string;
  skills: string[];
  color: "green" | "cyan" | "violet" | "pink";
}

export const tracks: Track[] = [
  { id: "explorer", name: "Explorer", level: "Beginner", tagline: "Find your footing.", skills: ["AI literacy", "Python & data", "Your first model"], color: "green" },
  { id: "builder", name: "Builder", level: "Intermediate", tagline: "Make things that learn.", skills: ["Classical ML", "Computer vision", "PyTorch", "NLP"], color: "cyan" },
  { id: "innovator", name: "Innovator", level: "Advanced", tagline: "Push past the tutorial.", skills: ["LLMs", "AI agents", "Generative AI", "Edge AI", "Responsible AI"], color: "violet" },
  { id: "summit", name: "Summit", level: "Hackathon", tagline: "Ship it in 24 hours.", skills: ["Teamwork", "Rapid prototyping", "Pitching"], color: "pink" },
];

// "Which step should you start from?" quiz. Each answer adds points;
// the total picks a starting step via `quizResult`.
export const quiz = [
  {
    q: "Have you written Python before?",
    options: [
      { label: "Never", score: 0 },
      { label: "A little — loops and functions", score: 1 },
      { label: "Comfortably, with libraries", score: 2 },
    ],
  },
  {
    q: "Have you trained a machine learning model?",
    options: [
      { label: "No", score: 0 },
      { label: "Followed a tutorial once", score: 1 },
      { label: "Yes, and evaluated it properly", score: 3 },
    ],
  },
  {
    q: "Neural networks to you are…",
    options: [
      { label: "Magic", score: 0 },
      { label: "Layers of weights, roughly", score: 1 },
      { label: "Something I've built in PyTorch/TensorFlow", score: 3 },
    ],
  },
  {
    q: "What excites you most?",
    options: [
      { label: "Understanding the basics", score: 0 },
      { label: "Building apps with AI", score: 1 },
      { label: "LLMs, agents and hardware", score: 2 },
    ],
  },
];

export function quizResult(total: number): number {
  if (total <= 1) return 1;
  if (total <= 3) return 2;
  if (total <= 5) return 3;
  if (total <= 7) return 5;
  return 7;
}
