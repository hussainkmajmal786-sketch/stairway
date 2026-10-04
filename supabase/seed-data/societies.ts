export interface SocietySeed {
  slug: "main" | "cs" | "ias" | "ras" | "wie";
  name: string;
  shortName: string;
  color: "yellow" | "blue" | "green" | "red" | "orange" | "purple";
  description: string;
  tracks: string[];
}

export const SOCIETIES: SocietySeed[] = [
  {
    slug: "main", name: "IEEE Student Branch CEK", shortName: "Main IEEE", color: "yellow",
    description: "The branch-wide stairway: research, security, data and generative media.",
    tracks: ["AI × Research & Innovation", "AI × Cybersecurity", "AI × Data Analytics", "AI × Generative Media"],
  },
  {
    slug: "cs", name: "IEEE Computer Society", shortName: "CS", color: "blue",
    description: "Build software with AI: web, apps, cloud and engineering practice.",
    tracks: ["AI × Web Development", "AI × App Development", "AI × Cloud & DevOps", "AI × Software Engineering"],
  },
  {
    slug: "ias", name: "IEEE Industry Applications Society", shortName: "IAS", color: "orange",
    description: "AI on the factory floor: automation, maintenance, twins and manufacturing.",
    tracks: ["AI × Industrial Automation", "AI × Predictive Maintenance", "AI × Digital Twins", "AI × Smart Manufacturing"],
  },
  {
    slug: "ras", name: "IEEE Robotics & Automation Society", shortName: "RAS", color: "green",
    description: "Machines that see and move: robotics, vision, autonomy and ROS.",
    tracks: ["AI × Robotics", "AI × Computer Vision", "AI × Autonomous Systems", "AI × ROS"],
  },
  {
    slug: "wie", name: "IEEE Women in Engineering", shortName: "WIE", color: "purple",
    description: "Women building AI for everyone — health, inclusion, impact and leadership.",
    tracks: ["AI × HealthTech", "AI × Inclusive Design", "AI × Social Impact", "AI × Entrepreneurship & Leadership"],
  },
];
