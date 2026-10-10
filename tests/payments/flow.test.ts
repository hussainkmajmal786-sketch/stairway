import { describe, expect, it } from "vitest";
import { afterCheckout, afterRegister, afterVerify } from "@/lib/payments/flow";
import { registrationError } from "@/lib/registration/errors";

const ID = "33333333-3333-4333-8333-333333333333";
const T = `/me/tickets/${ID}`;

describe("afterCheckout", () => {
  it("continues after a payment", () => expect(afterCheckout("paid", null)).toBeNull());
  it("shows a retryable error on the page that owns the flow", () => {
    expect(afterCheckout("dismissed", null)).toEqual({ kind: "error", error: registrationError("payment_cancelled") });
    expect(afterCheckout("unavailable", null)).toEqual({ kind: "error", error: registrationError("checkout_unavailable") });
  });
  it("moves to the ticket page (Complete payment + countdown) when the form opened Checkout", () => {
    expect(afterCheckout("dismissed", `${T}?new=1`)).toEqual({ kind: "navigate", href: `${T}?new=1` });
  });
});

describe("afterVerify", () => {
  it("goes to the ticket for every success and for outcomes the ticket page explains", () => {
    expect(afterVerify({ ok: true, status: "confirmed" }, T)).toEqual({ kind: "navigate", href: `${T}?paid=1` });
    expect(afterVerify({ ok: true, status: "processing" }, T)).toEqual({ kind: "navigate", href: `${T}?paid=1` });
    expect(afterVerify({ ok: true, status: "refund_needed" }, T)).toEqual({ kind: "navigate", href: `${T}?paid=1` });
    expect(afterVerify({ ok: false, error: registrationError("payment_processing") }, T)).toEqual({ kind: "navigate", href: `${T}?paid=1` });
  });
  it("sends unverified / review payments with their own marker, never ?paid=1 (the Pay button stays reachable)", () => {
    expect(afterVerify({ ok: false, error: registrationError("payment_unverified") }, T)).toEqual({ kind: "navigate", href: `${T}?paid=unverified` });
    expect(afterVerify({ ok: false, error: registrationError("payment_review") }, T)).toEqual({ kind: "navigate", href: `${T}?paid=review` });
  });
  it("stays to show errors with another recovery", () => {
    expect(afterVerify({ ok: false, error: registrationError("not_signed_in") }, T)).toEqual({ kind: "error", error: registrationError("not_signed_in") });
    expect(afterVerify({ ok: false, error: registrationError("payment_failed") }, T)).toEqual({ kind: "error", error: registrationError("payment_failed") });
  });
});

describe("afterRegister (U-1)", () => {
  it("routes a pending_payment hold to the payment step, never to the ?new=1 'You're in' copy", () => {
    const step = afterRegister({ registrationId: ID, status: "pending_payment" });
    expect(step).toEqual({ kind: "pay", registrationId: ID });
    expect(JSON.stringify(step)).not.toContain("new=1");
  });
  it("sends confirmed and waitlisted seats to the ticket with ?new=1", () => {
    expect(afterRegister({ registrationId: ID, status: "confirmed" })).toEqual({ kind: "navigate", href: `${T}?new=1` });
    expect(afterRegister({ registrationId: ID, status: "waitlisted" })).toEqual({ kind: "navigate", href: `${T}?new=1` });
  });
});
