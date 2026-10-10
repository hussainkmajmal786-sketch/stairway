import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_SRC, checkoutOptions, checkoutTimeoutSeconds, loadCheckoutScript, parseCheckoutSuccess, resetCheckoutLoader,
} from "@/lib/payments/checkout";
import type { CheckoutData } from "@/lib/payments/actions";

const NOW = Date.parse("2026-10-10T10:00:00Z");
const DATA: CheckoutData = {
  keyId: "rzp_test_ABCDEFGH1234", orderId: "order_P4UI00000001", amountPaise: 19900, currency: "INR", name: "st(AI)rway",
  description: "Seeing Machines", prefill: { name: "Asha", email: "asha@example.com" },
  notes: { source: "stairway", registration_id: "33333333-3333-4333-8333-333333333333" },
  holdExpiresAt: "2026-10-10T10:15:00Z", registrationId: "33333333-3333-4333-8333-333333333333",
};

type FakeScript = { src: string; async: boolean; onload?: () => void; onerror?: () => void; remove: () => void };
function fakeHost() {
  const scripts: FakeScript[] = [];
  const host = {
    document: {
      createElement: () => ({ src: "", async: false, remove: vi.fn() }) as FakeScript,
      head: { appendChild: (s: FakeScript) => (scripts.push(s), s) },
    },
  };
  return { host: host as never, scripts };
}

afterEach(() => resetCheckoutLoader());

describe("checkoutOptions", () => {
  it("passes only server-provided values, our notes and the handlers", () => {
    const onSuccess = vi.fn();
    const onDismiss = vi.fn();
    const o = checkoutOptions(DATA, { onSuccess, onDismiss }, NOW);
    expect(o).toMatchObject({
      key: DATA.keyId, order_id: DATA.orderId, amount: 19900, currency: "INR", name: "st(AI)rway", description: "Seeing Machines",
      prefill: { name: "Asha", email: "asha@example.com" }, notes: DATA.notes,
    });
    expect(o.handler).toBe(onSuccess);
    expect((o.modal as { ondismiss: unknown }).ondismiss).toBe(onDismiss);
    expect(JSON.stringify(o)).not.toContain("secret");
  });

  it("closes Checkout 60 s before the hold ends", () => {
    const h = { onSuccess: vi.fn(), onDismiss: vi.fn() };
    expect(checkoutOptions(DATA, h, NOW).timeout).toBe(15 * 60 - 60);
    expect(checkoutOptions(DATA, h, NOW + 13 * 60_000).timeout).toBe(60);
  });
});

describe("checkoutTimeoutSeconds", () => {
  it("is seconds left minus the margin, at least 1, null when unparsable", () => {
    expect(checkoutTimeoutSeconds("2026-10-10T10:03:00Z", NOW)).toBe(120);
    expect(checkoutTimeoutSeconds("2026-10-10T10:00:30Z", NOW)).toBe(1);
    expect(checkoutTimeoutSeconds("2026-10-10T09:00:00Z", NOW)).toBe(1);
    expect(checkoutTimeoutSeconds("nope", NOW)).toBeNull();
  });
});

describe("parseCheckoutSuccess", () => {
  it("accepts Razorpay's success payload and rejects anything else", () => {
    const ok = { razorpay_payment_id: "pay_P4UI00000001", razorpay_order_id: "order_P4UI00000001", razorpay_signature: "a".repeat(64) };
    expect(parseCheckoutSuccess(ok)).toEqual({ paymentId: "pay_P4UI00000001", orderId: "order_P4UI00000001", signature: "a".repeat(64) });
    expect(parseCheckoutSuccess({ ...ok, razorpay_signature: "nope" })).toBeNull();
    expect(parseCheckoutSuccess(null)).toBeNull();
  });
});

describe("loadCheckoutScript", () => {
  it("injects the official checkout.js once and resolves when it loads", async () => {
    const { host, scripts } = fakeHost();
    const a = loadCheckoutScript(host);
    const b = loadCheckoutScript(host);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(CHECKOUT_SRC);
    expect(CHECKOUT_SRC).toBe("https://checkout.razorpay.com/v1/checkout.js");
    scripts[0].onload?.();
    expect(await a).toBe(true);
    expect(await b).toBe(true);
  });
  it("resolves false on a load error and lets a later attempt retry", async () => {
    const { host, scripts } = fakeHost();
    const a = loadCheckoutScript(host);
    scripts[0].onerror?.();
    expect(await a).toBe(false);
    expect(scripts[0].remove).toHaveBeenCalled();
    void loadCheckoutScript(host);
    expect(scripts).toHaveLength(2);
  });
  it("does not inject anything when Razorpay is already present", async () => {
    const { host, scripts } = fakeHost();
    expect(await loadCheckoutScript({ ...(host as object), Razorpay: function () {} } as never)).toBe(true);
    expect(scripts).toHaveLength(0);
  });
  it("is never injected at import time (only when a payment starts)", () => {
    const { scripts } = fakeHost();
    expect(scripts).toHaveLength(0);
  });
});
