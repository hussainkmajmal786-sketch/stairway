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
];

/** Pairs the design forbids for text; the test proves they really fail so nobody "fixes" the rule away. */
export const FORBIDDEN_PAIRS: ContrastPair[] = [
  { fg: "ink", bg: "field", min: 3, use: "ink type on the cobalt field (ink is decoration only there)" },
];
