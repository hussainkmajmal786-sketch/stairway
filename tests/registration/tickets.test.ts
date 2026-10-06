import { describe, expect, it } from "vitest";
import { nextTicket, rowToTicket, splitTickets, toSummary, type TicketRow, type TicketSummary } from "@/lib/registration/tickets";

const row: TicketRow = {
  id: "r1", status: "confirmed", waitlist_position: null, ticket_code: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", token_number: 7, checked_in_at: null,
  event: {
    id: "e1", slug: "seeing-machines", title: "Seeing Machines", topic: "CV", step_number: 1,
    starts_at: "2026-10-10T04:00:00+00:00", ends_at: "2026-10-10T11:00:00+00:00", price_paise: 0,
    ticket_type: "qr", token_prefix: "RAS-01", society: { short_name: "RAS", color: "green" },
  },
};

describe("rowToTicket", () => {
  it("maps a row and formats the token", () => {
    const t = rowToTicket(row)!;
    expect(t.token).toBe("RAS-01-0007");
    expect(t.ticketCode).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(t.checkedInAt).toBeNull();
    expect(t.ticketType).toBe("qr");
    expect(t.event).toEqual({
      id: "e1", slug: "seeing-machines", title: "Seeing Machines", topic: "CV", step: 1,
      start: "2026-10-10T04:00:00+00:00", end: "2026-10-10T11:00:00+00:00", pricePaise: 0,
      societyShort: "RAS", societyColor: "green",
    });
  });
  it("has no token while waitlisted", () =>
    expect(rowToTicket({ ...row, status: "waitlisted", waitlist_position: 2, token_number: null })!.token).toBeNull());
  it("has no token while waitlisted even if an old token number is kept", () => {
    const t = rowToTicket({ ...row, status: "waitlisted", waitlist_position: 1, token_number: 3 })!;
    expect(t.token).toBeNull();
    expect(t.waitlistPosition).toBe(1);
  });
  it("drops rows whose event (or society) is not visible", () => {
    expect(rowToTicket({ ...row, event: null })).toBeNull();
    expect(rowToTicket({ ...row, event: { ...row.event!, society: null } })).toBeNull();
  });
  it("toSummary strips the ticket code and check-in time", () => {
    const s = toSummary(rowToTicket({ ...row, checked_in_at: "2026-10-10T04:30:00+00:00" })!);
    expect("ticketCode" in s).toBe(false);
    expect("checkedInAt" in s).toBe(false);
    expect(JSON.stringify(s)).not.toContain(row.ticket_code);
  });
});

describe("splitTickets / nextTicket", () => {
  const base = toSummary(rowToTicket(row)!);
  const mk = (id: string, start: string, end: string): TicketSummary => ({ ...base, id, event: { ...base.event, start, end } });
  const NOW = Date.parse("2026-10-10T06:00:00Z");
  const list = [
    mk("later", "2026-11-01T04:00:00Z", "2026-11-01T11:00:00Z"),
    mk("past", "2026-09-01T04:00:00Z", "2026-09-01T11:00:00Z"),
    mk("live", "2026-10-10T04:00:00Z", "2026-10-10T11:00:00Z"),
    mk("older", "2026-08-01T04:00:00Z", "2026-08-01T11:00:00Z"),
  ];
  it("keeps running events as upcoming and orders both lists", () => {
    const { upcoming, past } = splitTickets(list, NOW);
    expect(upcoming.map((t) => t.id)).toEqual(["live", "later"]);
    expect(past.map((t) => t.id)).toEqual(["past", "older"]);
  });
  it("treats an event ending exactly now as still upcoming", () =>
    expect(splitTickets([mk("edge", "2026-10-10T04:00:00Z", "2026-10-10T06:00:00Z")], NOW).upcoming).toHaveLength(1));
  it("does not mutate its input", () => {
    const copy = [...list];
    splitTickets(list, NOW);
    expect(list).toEqual(copy);
  });
  it("picks the next ticket", () => {
    expect(nextTicket(list, NOW)?.id).toBe("live");
    expect(nextTicket([list[1]], NOW)).toBeNull();
    expect(nextTicket([], NOW)).toBeNull();
  });
});
