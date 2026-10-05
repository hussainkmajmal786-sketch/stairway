// Gallery photos. Drop images in /public/gallery/ and set `src`.
// Items without `src` render as generated artwork so the layout never breaks.

export interface GalleryItem {
  id: string;
  step: number;
  caption: string;
  src?: string;
  alt: string;
  ratio: "tall" | "wide" | "square";
  hue: number; // tint for the generated placeholder
}

export const gallery: GalleryItem[] = [
  { id: "g1", step: 1, caption: "A packed seminar hall for the very first step", alt: "Audience in a seminar hall during the opening keynote", ratio: "wide", hue: 190 },
  { id: "g2", step: 1, caption: "First models trained before lunch", alt: "Students gathered around a laptop training a model", ratio: "tall", hue: 210 },
  { id: "g3", step: 1, caption: "Mapping the stairway on the whiteboard", alt: "Whiteboard covered in a hand-drawn AI roadmap", ratio: "square", hue: 260 },
  { id: "g4", step: 2, caption: "Pandas, chai and messy rainfall data", alt: "Students coding in pairs in a computer lab", ratio: "square", hue: 280 },
  { id: "g5", step: 2, caption: "Mentors debugging side by side", alt: "A mentor helping a student debug code", ratio: "tall", hue: 230 },
  { id: "g6", step: 3, caption: "Gradient descent, by hand, on glass", alt: "Speaker drawing a loss curve on a glass board", ratio: "wide", hue: 175 },
  { id: "g7", step: 3, caption: "Gradient Gang takes the bus-delay challenge", alt: "Winning team holding certificates on stage", ratio: "square", hue: 320 },
  { id: "g8", step: 3, caption: "Show & tell: three teams, three approaches", alt: "Student presenting results on a projector", ratio: "tall", hue: 200 },
];
