import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/payments/actions", () => ({ createPaymentOrder: vi.fn(), verifyPayment: vi.fn() }));
vi.mock("@/lib/registration/actions", () => ({ registerForEvent: vi.fn() }));

import { RegistrationForm } from "@/components/registration/RegistrationForm";

const initial = { fullName: "Asha", college: "X", branch: "", year: "", phone: "", ieeeMemberId: "" };
const html = (p: { waitlist?: boolean; paid?: { pricePaise: number; step: number } }) =>
  renderToStaticMarkup(
    createElement(RegistrationForm, { slug: "seeing-machines", questions: [], initial, waitlist: false, fallbackUrl: null, ...p }),
  );

describe("RegistrationForm paid copy", () => {
  it("keeps the free copy exactly when no price is passed (payments off)", () => {
    const out = html({});
    expect(out).toContain("Free registration");
    expect(out).toContain("Confirm registration");
    expect(out).not.toContain("Razorpay");
    expect(out).not.toContain("₹");
  });
  it("shows the price and the hold wording for a paid session", () => {
    const out = html({ paid: { pricePaise: 19900, step: 3 } });
    expect(out).toContain("Paid registration · ₹199");
    expect(out).toContain("Continue to payment · ₹199");
    expect(out).toContain("holds your seat for 15 minutes");
    expect(out).not.toContain("Free registration");
  });
  it("says no payment now for a paid waitlist", () => {
    const out = html({ waitlist: true, paid: { pricePaise: 19900, step: 3 } });
    expect(out).toContain("No payment now");
    expect(out).toContain("Join the waitlist");
  });
  it("never loads checkout.js at render time", () => {
    expect(html({ paid: { pricePaise: 19900, step: 3 } })).not.toContain("checkout.razorpay.com");
  });
});
