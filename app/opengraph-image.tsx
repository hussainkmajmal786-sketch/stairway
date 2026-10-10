import { ImageResponse } from "next/og";
import { OG_HOME, OgFrame, ogFontText, ogSize } from "@/lib/og";
import { ogFonts } from "@/lib/og-font";

export const alt = "st(AI)rway — Weekend AI Event Series by IEEE SB CEK";
export const size = ogSize;
export const contentType = "image/png";

export default async function Image() {
  const card = { ...OG_HOME, title: null };
  return new ImageResponse(<OgFrame {...card} />, { ...size, fonts: await ogFonts(ogFontText(card)) });
}
