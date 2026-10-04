// Points: 10 per weekend attended, +5 for completing the lab challenge,
// +15 for a podium finish. Update after each weekend.

export interface Climber {
  name: string;
  detail: string;
  steps: number; // weekends attended
  streak: number; // consecutive weekends
  points: number;
}

export const climbers: Climber[] = [
  { name: "Sreehari K.", detail: "S7 CSE", steps: 3, streak: 3, points: 60 },
  { name: "Riya Benny", detail: "S5 CSE", steps: 3, streak: 3, points: 55 },
  { name: "Akhil Sabu", detail: "S3 ECE", steps: 3, streak: 3, points: 50 },
  { name: "Neha Philip", detail: "S5 EEE", steps: 3, streak: 3, points: 45 },
  { name: "Anand V.", detail: "S5 IT", steps: 3, streak: 2, points: 45 },
  { name: "Christy Mathew", detail: "S3 CSE", steps: 2, streak: 2, points: 35 },
  { name: "Arun Das", detail: "S3 ME", steps: 2, streak: 2, points: 30 },
  { name: "Lakshmi Priya", detail: "S7 ECE", steps: 2, streak: 1, points: 25 },
];

export const streakBadges = [
  { id: "1-step", label: "First Step", need: 1, desc: "Attend any weekend" },
  { id: "3-step", label: "Three-Step Streak", need: 3, desc: "3 weekends in a row" },
  { id: "6-step", label: "Halfway Climber", need: 6, desc: "6 weekends in a row" },
  { id: "summit", label: "Summit Climber", need: 12, desc: "Finish the Summit hackathon" },
];

export const featuredProjects = [
  { title: "Bus Delay Predictor", team: "Gradient Gang", step: "Step 03", blurb: "Predicts KSRTC delays from route and weather data — MAE 3.2 minutes.", hue: 190 },
  { title: "Rainfall Story Map", team: "Riya & Anand", step: "Step 02", blurb: "Interactive visual story of 50 years of Kottayam rainfall.", hue: 260 },
  { title: "Doodle Classifier", team: "Akhil Sabu", step: "Step 01", blurb: "Teachable Machine model that recognises 12 hand-drawn campus landmarks.", hue: 320 },
];
