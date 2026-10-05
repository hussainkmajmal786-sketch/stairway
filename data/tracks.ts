// "Which step should you start from?" quiz. Each answer adds points;
// the total picks a level via `quizLevel`.
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

export function quizLevel(total: number): "Beginner" | "Intermediate" | "Advanced" {
  if (total <= 3) return "Beginner";
  if (total <= 7) return "Intermediate";
  return "Advanced";
}
