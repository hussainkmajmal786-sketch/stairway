import { ImageResponse } from "next/og";
import { OgFrame, ogSize } from "@/lib/og";

export const alt = "st(AI)rway — Weekend AI Event Series by IEEE SB CEK";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <OgFrame eyebrow="Weekend AI event series" title="Climb into AI." subtitle="One weekend at a time · College of Engineering Kidangoor" />,
    size,
  );
}
