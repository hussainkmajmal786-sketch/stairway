import type { EventStatus, EventView, EventWithStatus } from "./types";

/** completed / next / upcoming, computed separately for each society's stairway. */
export function withStatus(events: EventView[], now: number): EventWithStatus[] {
  const nextBySociety = new Map<string, string>();
  const bySociety = new Map<string, EventView[]>();
  for (const e of events) bySociety.set(e.society.slug, [...(bySociety.get(e.society.slug) ?? []), e]);
  for (const [slug, list] of bySociety) {
    const first = [...list].sort((a, b) => a.step - b.step).find((e) => new Date(e.end).getTime() >= now);
    if (first) nextBySociety.set(slug, first.id);
  }
  return events.map((e) => {
    let status: EventStatus;
    if (new Date(e.end).getTime() < now) status = "completed";
    else if (nextBySociety.get(e.society.slug) === e.id) status = "next";
    else status = "upcoming";
    return { ...e, status, seatsLeft: Math.max(0, e.seatsTotal - e.seatsFilled) };
  });
}

export function nextOverall(list: EventWithStatus[]) {
  return list
    .filter((e) => e.status === "next")
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];
}

export const nextForSociety = (list: EventWithStatus[], slug: string) =>
  list.find((e) => e.society.slug === slug && e.status === "next");

export const societyStairway = (list: EventWithStatus[], slug: string) =>
  list.filter((e) => e.society.slug === slug).sort((a, b) => a.step - b.step);
