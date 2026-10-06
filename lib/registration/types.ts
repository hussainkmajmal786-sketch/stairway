export const REGISTRATION_STATUSES = [
  "pending_payment", "confirmed", "waitlisted", "cancelled", "refunded", "refund_needed",
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/** Statuses that hold (or wait for) a seat. Cancelled/refunded rows behave as "not registered". */
export const ACTIVE_STATUSES = ["pending_payment", "confirmed", "waitlisted"] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export function isActiveStatus(s: RegistrationStatus): s is ActiveStatus {
  return (ACTIVE_STATUSES as readonly string[]).includes(s);
}

export interface MyRegistration {
  id: string;
  status: RegistrationStatus;
  waitlistPosition: number | null;
}

/** One row of the public.event_attendees view (public profile fields only). */
export interface Attendee {
  handle: string;
  fullName: string;
  avatarUrl: string | undefined;
  headline: string;
}
