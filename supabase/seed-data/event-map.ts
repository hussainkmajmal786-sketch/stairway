// Existing 12 sessions → society stairway, track and per-society step number.
export const EVENT_SOCIETY_MAP: Record<string, { society: string; track: string; step: number; finale?: boolean }> = {
  "ai-unlocked":               { society: "main", track: "AI × Research & Innovation", step: 1 },
  "python-for-ai":             { society: "main", track: "AI × Data Analytics", step: 2 },
  "ml-from-scratch":           { society: "main", track: "AI × Data Analytics", step: 3 },
  "deep-learning-decoded":     { society: "main", track: "AI × Research & Innovation", step: 4 },
  "inside-llms":               { society: "main", track: "AI × Generative Media", step: 5 },
  "generative-ai":             { society: "main", track: "AI × Generative Media", step: 6 },
  "responsible-ai":            { society: "main", track: "AI × Cybersecurity", step: 7 },
  "the-summit":                { society: "main", track: "AI × Research & Innovation", step: 8, finale: true },
  "language-and-machines":     { society: "cs", track: "AI × Software Engineering", step: 1 },
  "prompt-engineering-agents": { society: "cs", track: "AI × Web Development", step: 2 },
  "seeing-machines":           { society: "ras", track: "AI × Computer Vision", step: 1 },
  "ai-on-the-edge":            { society: "ias", track: "AI × Industrial Automation", step: 1 },
};
