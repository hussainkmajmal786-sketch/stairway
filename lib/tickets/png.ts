// Client-only: draws the ticket on a canvas (DOM APIs only, no Node, no server imports). Never import from server code.

import { QUIET_ZONE } from "./layout";

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
const INK = "#100f0d";
const PAPER = "#f4efe6";
const YELLOW = "#ffb200";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

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

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(48, 48, W - 96, 120);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  ctx.beginPath();
  ctx.moveTo(48, 168);
  ctx.lineTo(W - 48, 168);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `bold 40px ${MONO}`;
  ctx.fillText("ST(AI)RWAY TICKET", 96, 124);
  ctx.font = `bold 28px ${MONO}`;
  for (const l of wrap(t.eyebrow.toUpperCase(), W - 192, 1)) ctx.fillText(l, 96, 236);

  ctx.font = `600 58px ${SANS}`;
  let y = 314;
  for (const l of wrap(t.title, W - 192, 2)) {
    ctx.fillText(l, 96, y);
    y += 68;
  }
  ctx.font = `32px ${SANS}`;
  y += 8;
  for (const text of [t.when, t.venue, t.name]) {
    for (const l of wrap(text, W - 192, 1)) {
      ctx.fillText(l, 96, y);
      y += 46;
    }
  }

  ctx.textAlign = "center";
  const top = Math.max(y + 24, 600);
  if (t.qrRows && t.qrRows.length > 0) {
    const { px: mod, size } = qrLayout(t.qrRows.length, 560);
    const x0 = Math.round((W - size) / 2);
    const y0 = top;
    // White square includes the 4-module quiet zone; the border sits outside it.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x0, y0, size, size);
    ctx.lineWidth = 4;
    ctx.strokeRect(x0 - 2, y0 - 2, size + 4, size + 4);
    ctx.fillStyle = "#000000";
    t.qrRows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === "1") {
          ctx.fillRect(x0 + (c + QUIET_ZONE) * mod, y0 + (r + QUIET_ZONE) * mod, mod, mod);
        }
      }
    });
    ctx.fillStyle = INK;
    ctx.font = `bold 28px ${MONO}`;
    ctx.fillText(t.token ? `SHOW AT THE DOOR · ${t.token}` : "SHOW AT THE DOOR", W / 2, y0 + size + 50);
    if (t.code) {
      ctx.font = `24px ${MONO}`;
      ctx.fillText(t.code, W / 2, y0 + size + 90);
    }
  } else if (t.token) {
    const cardY = top + 20;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(120, cardY, W - 240, 360);
    ctx.lineWidth = 6;
    ctx.strokeRect(120, cardY, W - 240, 360);
    ctx.fillStyle = INK;
    ctx.font = `bold 32px ${MONO}`;
    ctx.fillText("YOUR TOKEN", W / 2, cardY + 80);
    // Shrink long prefixed tokens so they always fit inside the card.
    let px = 120;
    do {
      ctx.font = `bold ${px}px ${MONO}`;
      px -= 6;
    } while (px > 40 && ctx.measureText(t.token).width > W - 320);
    ctx.fillText(t.token, W / 2, cardY + 220);
    ctx.font = `28px ${SANS}`;
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
