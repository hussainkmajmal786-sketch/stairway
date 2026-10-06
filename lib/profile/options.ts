export const BRANCHES = [
  "Computer Science", "Electronics & Communication", "Electrical & Electronics",
  "Information Technology", "Mechanical", "Civil", "Other",
] as const;
export const YEARS = ["1st year", "2nd year", "3rd year", "4th year", "Postgraduate", "Faculty / Alumni"] as const;
export const SOCIAL_KEYS = ["linkedin", "github", "x", "instagram", "website"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export const SOCIAL_LABELS: Record<SocialKey, string> = {
  linkedin: "LinkedIn", github: "GitHub", x: "X", instagram: "Instagram", website: "Website",
};
