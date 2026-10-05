import type { Speaker } from "./types";

// Placeholder speakers — replace with your confirmed line-up.
// Add a photo by dropping a file in /public/speakers/ and setting `photo`.

export const speakers: Speaker[] = [
  {
    id: "anjali-nair",
    name: "Anjali Nair",
    designation: "Senior ML Engineer",
    organization: "Nimbus Labs, Bengaluru",
    bio: "Anjali builds language models for Indic languages and has shipped NLP systems used by millions. A CEK alumna, she started her AI journey in this very seminar hall.",
    topic: "Foundations & NLP",
    links: { linkedin: "https://linkedin.com", x: "https://x.com" },
  },
  {
    id: "rahul-varghese",
    name: "Rahul Varghese",
    designation: "Data Scientist",
    organization: "Backwater Analytics, Kochi",
    bio: "Rahul turns messy public datasets into decisions for state agencies. He teaches Pandas like it's a detective story.",
    topic: "Python for AI",
    links: { linkedin: "https://linkedin.com", website: "https://example.com" },
  },
  {
    id: "meera-krishnan",
    name: "Dr. Meera Krishnan",
    designation: "Assistant Professor, CSE",
    organization: "College of Engineering Kidangoor",
    bio: "Meera researches interpretable machine learning and fairness in healthcare models. She has supervised 20+ student ML projects.",
    topic: "Machine Learning",
    links: { linkedin: "https://linkedin.com" },
  },
  {
    id: "arjun-pillai",
    name: "Arjun Pillai",
    designation: "Embedded AI Engineer",
    organization: "Edgeworks Robotics, Technopark",
    bio: "Arjun puts neural networks on microcontrollers for agricultural drones. He believes every model should fit on a ₹500 board.",
    topic: "Computer Vision & Edge AI",
    links: { linkedin: "https://linkedin.com", x: "https://x.com" },
  },
  {
    id: "sneha-thomas",
    name: "Sneha Thomas",
    designation: "Computer Vision Researcher",
    organization: "IIIT Kottayam",
    bio: "Sneha works on generative models for medical imaging and runs a weekend art collective that paints with diffusion models.",
    topic: "Vision & Generative AI",
    links: { linkedin: "https://linkedin.com", website: "https://example.com" },
  },
  {
    id: "vishnu-prasad",
    name: "Vishnu Prasad",
    designation: "Deep Learning Engineer",
    organization: "Monsoon AI, Kochi",
    bio: "Vishnu trains large models for a living and debugs exploding gradients for fun. Kaggle Master, PyTorch contributor.",
    topic: "Deep Learning & LLMs",
    links: { linkedin: "https://linkedin.com", x: "https://x.com" },
  },
  {
    id: "dr-joseph-mathew",
    name: "Dr. Joseph Mathew",
    designation: "Principal Scientist, AI Safety",
    organization: "Indus Research Institute",
    bio: "Joseph leads evaluation research on large language models and advises policy bodies on responsible AI deployment.",
    topic: "LLMs & Responsible AI",
    links: { linkedin: "https://linkedin.com", website: "https://example.com" },
  },
  {
    id: "nikhil-raj",
    name: "Nikhil Raj",
    designation: "Founder & CTO",
    organization: "AgentForge",
    bio: "Nikhil's startup builds AI agents for small businesses across Kerala. He has judged 15+ hackathons and still loves the 3 a.m. energy.",
    topic: "Agents & Prompt Engineering",
    links: { linkedin: "https://linkedin.com", x: "https://x.com", website: "https://example.com" },
  },
];

export const speakerById = (id: string) => speakers.find((s) => s.id === id);
