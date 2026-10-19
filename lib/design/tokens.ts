/**
 * Cobalt Circuit design tokens: the single source for colours used outside CSS (ticket PNG, OG images, icons,
 * manifest, inline SVG fills). app/globals.css :root mirrors these hexes; tests/design/tokens.test.ts keeps them in
 * sync and checks every documented text/background pair against its WCAG minimum.
 */
export const TOKENS = {
  field: "#1C3FD0",
  field2: "#122C99",
  paper: "#F4EFE6",
  paper2: "#E8E1D3",
  paper3: "#DCD3C2",
  ink: "#0B1026",
  ink2: "#2A2F48",
  ink3: "#454A63",
  ink4: "#5A5F78",
  yellow: "#FFC21A",
  blue: "#6CC8FF",
  green: "#2EDB6A",
  red: "#FF5C5C",
  orange: "#FF7A3D",
  purple: "#C9A0FF",
  blueInk: "#1C3FD0",
  purpleInk: "#6B2FB5",
  redInk: "#C31F1F",
  greenInk: "#0A7A2A",
  amberInk: "#8A5A00",
  errorBg: "#FFF6F5",
  white: "#FFFFFF",
  black: "#000000",
} as const;

export type TokenName = keyof typeof TOKENS;

/** The custom property in app/globals.css for each token that has one (white and black are used literally). */
export const CSS_VARS: Partial<Record<TokenName, `--${string}`>> = {
  field: "--field",
  field2: "--field-2",
  paper: "--paper",
  paper2: "--paper-2",
  paper3: "--paper-3",
  ink: "--ink",
  ink2: "--ink-2",
  ink3: "--ink-3",
  ink4: "--ink-4",
  yellow: "--yellow",
  blue: "--blue",
  green: "--green",
  red: "--red",
  orange: "--orange",
  purple: "--purple",
  blueInk: "--blue-ink",
  purpleInk: "--purple-ink",
  redInk: "--red-ink",
  greenInk: "--green-ink",
  amberInk: "--amber-ink",
  errorBg: "--error-bg",
};

export interface ContrastPair {
  fg: TokenName;
  bg: TokenName;
  min: number;
  use: string;
}

/** WCAG minimums: 4.5 normal text, 3 large text (≥24px, or ≥18.66px bold) and non-text UI (focus rings, boundaries). */
export const CONTRAST_PAIRS: ContrastPair[] = [
  { fg: "ink", bg: "paper", min: 7, use: "body text" },
  { fg: "ink2", bg: "paper", min: 4.5, use: "secondary text" },
  { fg: "ink3", bg: "paper", min: 4.5, use: "muted labels" },
  { fg: "ink3", bg: "paper2", min: 4.5, use: "muted labels on alternate bands" },
  { fg: "ink4", bg: "paper", min: 4.5, use: "faint labels" },
  { fg: "ink4", bg: "paper2", min: 4.5, use: "faint labels on alternate bands" },
  { fg: "ink4", bg: "white", min: 4.5, use: "input placeholders" },
  { fg: "ink", bg: "white", min: 7, use: "input text" },
  { fg: "ink", bg: "paper3", min: 4.5, use: "neutral chips" },
  { fg: "paper", bg: "field", min: 4.5, use: "cream text and mono captions on the field" },
  { fg: "paper", bg: "field2", min: 4.5, use: "cream text on the deep field" },
  { fg: "yellow", bg: "field", min: 3, use: "large yellow display words and the focus ring on the field" },
  { fg: "paper", bg: "ink", min: 4.5, use: "top bar and ink buttons" },
  { fg: "yellow", bg: "ink", min: 4.5, use: "countdown units and the focus ring in the top bar" },
  { fg: "ink", bg: "yellow", min: 4.5, use: "primary buttons and the (AI) block" },
  { fg: "ink3", bg: "yellow", min: 4.5, use: "seat labels ('% full') on the yellow next-step card" },
  { fg: "blueInk", bg: "paper", min: 4.5, use: "links and coloured text on cream" },
  { fg: "field", bg: "paper2", min: 4.5, use: "field-coloured text on alternate bands" },
  { fg: "field", bg: "white", min: 3, use: "input focus ring" },
  { fg: "ink", bg: "green", min: 4.5, use: "beginner / climbed chips" },
  { fg: "ink", bg: "blue", min: 4.5, use: "intermediate chips" },
  { fg: "ink", bg: "purple", min: 4.5, use: "advanced chips" },
  { fg: "ink", bg: "orange", min: 4.5, use: "summit chips" },
  { fg: "ink", bg: "red", min: 4.5, use: "urgency and error chips" },
  { fg: "redInk", bg: "paper", min: 4.5, use: "error text" },
  { fg: "redInk", bg: "paper2", min: 4.5, use: "error text on alternate bands" },
  { fg: "redInk", bg: "errorBg", min: 4.5, use: "error text beside an invalid input" },
  { fg: "greenInk", bg: "paper", min: 4.5, use: "success text (cream only, never paper-2)" },
  { fg: "purpleInk", bg: "paper", min: 4.5, use: "coloured labels" },
  { fg: "amberInk", bg: "paper", min: 4.5, use: "coloured labels" },
  { fg: "black", bg: "white", min: 7, use: "QR modules on their white quiet zone" },
  { fg: "yellow", bg: "field2", min: 3, use: "hero stats numbers and the focus ring on the deep field (Ink Night strip)" },
  { fg: "ink", bg: "paper2", min: 4.5, use: "hero focus ring and text on the paper-2 strip (Paper Daylight)" },
  { fg: "field", bg: "paper", min: 4.5, use: "hero lettering and CTA fill on cream (Paper Daylight)" },
  { fg: "ink", bg: "orange", min: 4.5, use: "hero text on the Sunrise field" },
];

/** Pairs the design forbids for text; the test proves they really fail so nobody "fixes" the rule away. */
export const FORBIDDEN_PAIRS: ContrastPair[] = [
  { fg: "ink", bg: "field", min: 3, use: "ink type on the cobalt field (ink is decoration only there)" },
  { fg: "ink4", bg: "yellow", min: 4.5, use: "faint labels on yellow (3.88:1; use ink-3)" },
  { fg: "redInk", bg: "yellow", min: 4.5, use: "urgent text on yellow (3.67:1; SeatsBar onYellow uses ink)" },
  { fg: "ink", bg: "field2", min: 3, use: "ink type on the deep field (1.65:1)" },
  { fg: "greenInk", bg: "paper2", min: 4.5, use: "success text on alternate bands (4.21:1, cream only)" },
  { fg: "redInk", bg: "paper3", min: 4.5, use: "error text on paper-3 chips or disabled fills (4.00:1)" },
  { fg: "field", bg: "ink", min: 3, use: "cobalt type on the ink field (2.39:1; decoration only, e.g. the Paper Daylight extrusion)" },
  { fg: "field2", bg: "ink", min: 3, use: "deep-cobalt type on the ink field (1.5:1)" },
  { fg: "ink", bg: "ink", min: 4.5, use: "ink type on an ink field (invisible)" },
  { fg: "yellow", bg: "orange", min: 4.5, use: "yellow type on the Sunrise field (2.2:1; the verb sits on the cobalt panel)" },
  { fg: "paper", bg: "orange", min: 4.5, use: "cream type on the Sunrise field (2.7:1; the extrusion is decoration)" },
];

/* ───────── hero theme presets ─────────
 * Each preset is a `data-theme` value on the hero wrapper (app/globals.css `.hero[data-theme="…"]`). The roles below
 * name the TOKEN each CSS custom property (--hero-<role>) must alias; tests/design/hero-themes.test.ts keeps the CSS
 * and this table in sync and checks every text pair. null = transparent (the field shows through). */
export const HERO_PRESETS = ["cobalt", "ink", "daylight", "sunrise"] as const;
export type HeroPreset = (typeof HERO_PRESETS)[number];
export const HERO_DEFAULT_PRESET: HeroPreset = "cobalt";

export const HERO_PRESET_LABELS: Record<HeroPreset, string> = {
  cobalt: "Cobalt Poster",
  ink: "Ink Night",
  daylight: "Paper Daylight",
  sunrise: "Sunrise",
};

export type HeroRole =
  | "bg" | "fg" | "word" | "ext" | "ai-bg" | "ai-fg" | "frame" | "ghost" | "band-a" | "band-b" | "accent" | "verb-bg"
  | "panel-bg" | "panel-fg" | "cta1-bg" | "cta1-fg" | "cta1-shadow" | "cta2-bg" | "cta2-fg" | "cta2-border"
  | "stat-bg" | "stat-label" | "stat-num" | "stat-border" | "motif" | "motif-2" | "focus";

export const HERO_THEMES: Record<HeroPreset, Record<HeroRole, TokenName | null>> = {
  cobalt: {
    bg: "field", fg: "paper", word: "paper", ext: "ink", "ai-bg": "yellow", "ai-fg": "ink", frame: "paper", ghost: "paper",
    "band-a": "paper", "band-b": "ink", accent: "yellow", "verb-bg": null, "panel-bg": null, "panel-fg": "paper",
    "cta1-bg": "yellow", "cta1-fg": "ink", "cta1-shadow": "ink", "cta2-bg": null, "cta2-fg": "paper", "cta2-border": "paper",
    "stat-bg": "paper", "stat-label": "ink3", "stat-num": "field", "stat-border": "ink", motif: "paper", "motif-2": "yellow", focus: "yellow",
  },
  ink: {
    bg: "ink", fg: "paper", word: "paper", ext: "field", "ai-bg": "yellow", "ai-fg": "ink", frame: "paper", ghost: "paper",
    "band-a": "field", "band-b": "paper", accent: "yellow", "verb-bg": null, "panel-bg": null, "panel-fg": "paper",
    "cta1-bg": "yellow", "cta1-fg": "ink", "cta1-shadow": "field", "cta2-bg": null, "cta2-fg": "paper", "cta2-border": "paper",
    "stat-bg": "field2", "stat-label": "paper", "stat-num": "yellow", "stat-border": "paper", motif: "field", "motif-2": "blue", focus: "yellow",
  },
  daylight: {
    bg: "paper", fg: "ink", word: "field", ext: "ink", "ai-bg": "yellow", "ai-fg": "ink", frame: "ink", ghost: "field",
    "band-a": "yellow", "band-b": "red", accent: "ink", "verb-bg": "yellow", "panel-bg": null, "panel-fg": "ink",
    "cta1-bg": "field", "cta1-fg": "paper", "cta1-shadow": "ink", "cta2-bg": null, "cta2-fg": "ink", "cta2-border": "ink",
    "stat-bg": "paper2", "stat-label": "ink3", "stat-num": "field", "stat-border": "ink", motif: "ink", "motif-2": "red", focus: "ink",
  },
  sunrise: {
    bg: "orange", fg: "ink", word: "ink", ext: "paper", "ai-bg": "yellow", "ai-fg": "ink", frame: "ink", ghost: "ink",
    "band-a": "yellow", "band-b": "field", accent: "yellow", "verb-bg": null, "panel-bg": "field", "panel-fg": "paper",
    "cta1-bg": "ink", "cta1-fg": "yellow", "cta1-shadow": "field", "cta2-bg": "paper", "cta2-fg": "ink", "cta2-border": "ink",
    "stat-bg": "yellow", "stat-label": "ink3", "stat-num": "ink", "stat-border": "ink", motif: "yellow", "motif-2": "ink", focus: "ink",
  },
};

export interface HeroPair { fg: TokenName; bg: TokenName; min: number; use: string }

/** Every text / UI pair of a preset with its WCAG minimum (large display type 3, small text 4.5, focus ring 3). */
export function heroPairs(preset: HeroPreset): HeroPair[] {
  const t = HERO_THEMES[preset];
  const tok = (r: HeroRole) => {
    const v = t[r];
    if (!v) throw new Error(`${preset}.${r} is transparent`);
    return v;
  };
  const bg = tok("bg");
  const panel = t["panel-bg"] ?? bg;
  const verbOn = t["verb-bg"] ?? panel;
  const stat = tok("stat-bg");
  return [
    { fg: tok("fg"), bg, min: 4.5, use: "tagline, presents and handles" },
    { fg: tok("frame"), bg, min: 4.5, use: "frame text IEEE SB CE KIDANGOOR" },
    { fg: tok("word"), bg, min: 3, use: "wordmark lettering (large)" },
    { fg: tok("ai-fg"), bg: tok("ai-bg"), min: 4.5, use: "(AI) block" },
    { fg: tok("cta1-fg"), bg: tok("cta1-bg"), min: 4.5, use: "primary CTA" },
    { fg: tok("cta2-fg"), bg: t["cta2-bg"] ?? bg, min: 4.5, use: "secondary CTA" },
    { fg: tok("panel-fg"), bg: panel, min: 4.5, use: "headline row" },
    { fg: tok("accent"), bg: verbOn, min: 3, use: "headline verb (large)" },
    { fg: tok("stat-label"), bg: stat, min: 4.5, use: "stats label" },
    { fg: tok("stat-num"), bg: stat, min: 3, use: "stats number (large)" },
    { fg: tok("focus"), bg, min: 3, use: "focus ring on the field" },
    { fg: tok("stat-border"), bg: stat, min: 3, use: "focus ring on the stats strip (it uses the strip border colour)" },
  ];
}
