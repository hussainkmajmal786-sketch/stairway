import { event } from "@/data/event";
import type { Weekend } from "@/data/types";

const stamp = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const location = () => `${event.venue.name}, ${event.venue.address}`;

export function googleCalendarUrl(w: Weekend) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `st(AI)rway Step ${String(w.step).padStart(2, "0")}: ${w.title}`,
    dates: `${stamp(w.start)}/${stamp(w.end)}`,
    details: `${w.topic}\n\n${w.summary}\n\n${event.siteUrl}/weekend/${w.slug}`,
    location: location(),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

export function icsContent(w: Weekend) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IEEE SB CEK//stAIrway//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${w.slug}@stairway.ieeesbcek`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(w.start)}`,
    `DTEND:${stamp(w.end)}`,
    `SUMMARY:${esc(`st(AI)rway Step ${w.step}: ${w.title}`)}`,
    `DESCRIPTION:${esc(`${w.topic} — ${w.summary}`)}`,
    `LOCATION:${esc(location())}`,
    `URL:${event.siteUrl}/weekend/${w.slug}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(w: Weekend) {
  const blob = new Blob([icsContent(w)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stairway-step-${String(w.step).padStart(2, "0")}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
