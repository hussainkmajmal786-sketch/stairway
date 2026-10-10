// Client-only: draws the ticket on a canvas (DOM APIs only, no Node, no server imports). Never import from server code.

import { TOKENS } from "@/lib/design/tokens";
import { QR_DARK, QR_LIGHT, QUIET_ZONE } from "./layout";

export interface TicketPngData {
  eyebrow: string;
  title: string;
  when: string;
  venue: string;
  name: string;
  /** Door token (token tickets): drawn as a big text card instead of a QR. */
  token: string | null;
  /** QR matrix without quiet zone (QR tickets); the quiet zone is added here. */
  qrRows: string[] | null;
  /** Human-readable fallback printed under the QR. */
  code: string | null;
}

const W = 1080;
const H = 1350;
/** Card colours from the design tokens; the QR stays pure black on white. No texture: it bloats the file and hurts scanning. */
export const PNG_COLORS = {
  ink: TOKENS.ink,
  paper: TOKENS.paper,
  yellow: TOKENS.yellow,
  field: TOKENS.field,
  qrDark: QR_DARK,
  qrLight: QR_LIGHT,
} as const;
const { ink: INK, paper: PAPER, yellow: YELLOW, field: FIELD } = PNG_COLORS;
const WORDMARK: [string, boolean][] = [["st", false], ["(AI)", true], ["rway", false]];

/** System stacks used when the site faces (next/font, hashed family names) are unavailable to the canvas. */
export const FONT_FALLBACK = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

/** The site face (the value of its next/font CSS variable) first, then the system stack. */
export function fontStack(siteFamily: string | null | undefined, fallback: string): string {
  const family = siteFamily?.trim();
  return family ? `${family}, ${fallback}` : fallback;
}

/**
 * Sets `${style} ${stack}` on the canvas. The fallback is set first: a canvas silently ignores a font string it can't
 * parse, so a bad site family leaves the system stack in place instead of the 10px default (text is never tiny/blank).
 */
export function setCanvasFont(ctx: { font: string }, style: string, stack: string, fallback: string) {
  ctx.font = `${style} ${fallback}`;
  if (stack !== fallback) ctx.font = `${style} ${stack}`;
}

/**
 * Waits for the site faces, bounded by `timeoutMs`; never throws. A face that isn't ready by then is simply replaced by
 * the next family in the stack, so the PNG always has readable text.
 */
export async function loadCanvasFonts(
  fonts: Pick<FontFaceSet, "load"> | null | undefined,
  specs: string[],
  timeoutMs = 2000,
): Promise<boolean> {
  if (!fonts) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const loaded = Promise.all(specs.map((spec) => fonts.load(spec))).then(() => true);
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    return await Promise.race([loaded, timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Integer module size so every module is a whole number of pixels (crisp edges), quiet zone included. */
export function qrLayout(n: number, maxPx: number): { cells: number; px: number; size: number } {
  const cells = n + QUIET_ZONE * 2;
  const px = Math.max(1, Math.floor(maxPx / cells));
  return { cells, px, size: px * cells };
}

/** Greedy word wrap; the last kept line gets an ellipsis when text overflows `maxLines`. */
export function wrapText(
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || measure(next) <= maxWidth) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = `${last.includes(" ") ? last.replace(/\s+\S*$/, "") : last}…`;
  return kept;
}

export async function ticketPngBlob(t: TicketPngData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  const wrap = (text: string, maxWidth: number, maxLines: number) =>
    wrapText((s) => ctx.measureText(s).width, text, maxWidth, maxLines);

  // The site faces (next/font sets hashed family names in these variables), loaded before drawing; system fallbacks.
  const css = getComputedStyle(document.documentElement);
  const SANS = fontStack(css.getPropertyValue("--font-urbanist"), FONT_FALLBACK.sans);
  const MONO = fontStack(css.getPropertyValue("--font-space-mono"), FONT_FALLBACK.mono);
  await loadCanvasFonts(document.fonts, [`600 60px ${SANS}`, `32px ${SANS}`, `bold 32px ${MONO}`, `24px ${MONO}`]);
  const sans = (style: string) => setCanvasFont(ctx, style, SANS, FONT_FALLBACK.sans);
  const mono = (style: string) => setCanvasFont(ctx, style, MONO, FONT_FALLBACK.mono);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // Cobalt header strip with the cream wordmark ((AI) on its yellow block), "TICKET" and the diagonal ink/cream band.
  ctx.fillStyle = FIELD;
  ctx.fillRect(48, 48, W - 96, 120);
  ctx.save();
  ctx.beginPath();
  ctx.rect(48, 48, W - 96, 120);
  ctx.clip();
  const bandX = W - 48; // right edge of the strip; the band leans like the card's 110deg gradient
  for (const [from, to, colour] of [[130, 81, INK], [81, 57, PAPER]] as const) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(bandX - from + 22, 48);
    ctx.lineTo(bandX - to + 22, 48);
    ctx.lineTo(bandX - to - 22, 168);
    ctx.lineTo(bandX - from - 22, 168);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.beginPath();
  ctx.moveTo(48, 168);
  ctx.lineTo(W - 48, 168);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  sans("600 60px");
  let x = 96;
  for (const [part, block] of WORDMARK) {
    const w = ctx.measureText(part).width;
    if (block) {
      ctx.fillStyle = YELLOW;
      ctx.fillRect(x - 4, 76, w + 8, 68);
      ctx.fillStyle = INK;
    } else {
      ctx.fillStyle = PAPER;
    }
    ctx.fillText(part, x, 130);
    x += w + (block ? 8 : 0);
  }
  ctx.textAlign = "right";
  ctx.fillStyle = PAPER;
  mono("bold 32px");
  ctx.fillText("TICKET", W - 210, 122);

  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  mono("bold 28px");
  for (const l of wrap(t.eyebrow.toUpperCase(), W - 192, 1)) ctx.fillText(l, 96, 236);

  sans("600 58px");
  let y = 314;
  for (const l of wrap(t.title, W - 192, 2)) {
    ctx.fillText(l, 96, y);
    y += 68;
  }
  sans("32px");
  y += 8;
  for (const text of [t.when, t.venue, t.name]) {
    for (const l of wrap(text, W - 192, 1)) {
      ctx.fillText(l, 96, y);
      y += 46;
    }
  }

  // Perforation: dashed ink line with half-circle notches bitten out of the frame.
  const top = Math.max(y + 48, 620);
  const perfY = top - 28;
  ctx.save();
  ctx.setLineDash([18, 12]);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(96, perfY);
  ctx.lineTo(W - 96, perfY);
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = 6;
  for (const [cx, start, end] of [[48, -Math.PI / 2, Math.PI / 2], [W - 48, Math.PI / 2, (3 * Math.PI) / 2]] as const) {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(cx, perfY, 26, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, perfY, 26, start, end);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  if (t.qrRows && t.qrRows.length > 0) {
    const { px: mod, size } = qrLayout(t.qrRows.length, 560);
    const x0 = Math.round((W - size) / 2);
    const y0 = top;
    // White square includes the 4-module quiet zone; the border sits outside it.
    ctx.fillStyle = QR_LIGHT;
    ctx.fillRect(x0, y0, size, size);
    ctx.lineWidth = 4;
    ctx.strokeRect(x0 - 2, y0 - 2, size + 4, size + 4);
    ctx.fillStyle = QR_DARK;
    t.qrRows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === "1") {
          ctx.fillRect(x0 + (c + QUIET_ZONE) * mod, y0 + (r + QUIET_ZONE) * mod, mod, mod);
        }
      }
    });
    ctx.fillStyle = INK;
    mono("bold 28px");
    ctx.fillText(t.token ? `SHOW AT THE DOOR · ${t.token}` : "SHOW AT THE DOOR", W / 2, y0 + size + 50);
    if (t.code) {
      mono("24px");
      ctx.fillText(t.code, W / 2, y0 + size + 90);
    }
  } else if (t.token) {
    const cardY = top + 20;
    ctx.fillStyle = QR_LIGHT;
    ctx.fillRect(120, cardY, W - 240, 360);
    ctx.lineWidth = 6;
    ctx.strokeRect(120, cardY, W - 240, 360);
    ctx.fillStyle = INK;
    mono("bold 32px");
    ctx.fillText("YOUR TOKEN", W / 2, cardY + 80);
    // Shrink long prefixed tokens so they always fit inside the card.
    let px = 120;
    do {
      mono(`bold ${px}px`);
      px -= 6;
    } while (px > 40 && ctx.measureText(t.token).width > W - 320);
    ctx.fillText(t.token, W / 2, cardY + 220);
    sans("28px");
    ctx.fillText("Say or show this token at the door.", W / 2, cardY + 300);
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"),
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled (some browsers start the download asynchronously).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
