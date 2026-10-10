import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readCronSecret, readPaymentsConfig, readSyncConfig } from "@/lib/payments/config";

const FULL = {
  PAYMENTS_ENABLED: "true",
  RAZORPAY_KEY_ID: "rzp_test_ABCDEFGH1234",
  RAZORPAY_KEY_SECRET: "key_secret_value_123",
  RAZORPAY_WEBHOOK_SECRET: "webhook_secret_value",
  SUPABASE_SERVICE_ROLE_KEY: "service_role_key_value_000000",
};

describe("readPaymentsConfig", () => {
  it("is enabled only with the flag and every secret", () => {
    expect(readPaymentsConfig(FULL)).toEqual({
      enabled: true, keyId: FULL.RAZORPAY_KEY_ID, keySecret: FULL.RAZORPAY_KEY_SECRET,
      webhookSecret: FULL.RAZORPAY_WEBHOOK_SECRET, serviceRoleKey: FULL.SUPABASE_SERVICE_ROLE_KEY,
    });
  });
  it("stays off without the flag, with a non-'true' flag, or with any secret missing or blank", () => {
    expect(readPaymentsConfig({})).toEqual({ enabled: false });
    expect(readPaymentsConfig({ ...FULL, PAYMENTS_ENABLED: undefined })).toEqual({ enabled: false });
    expect(readPaymentsConfig({ ...FULL, PAYMENTS_ENABLED: "1" })).toEqual({ enabled: false });
    for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
      expect(readPaymentsConfig({ ...FULL, [k]: undefined })).toEqual({ enabled: false });
      expect(readPaymentsConfig({ ...FULL, [k]: "   " })).toEqual({ enabled: false });
    }
  });
  it("rejects a key id that is not a Razorpay key id", () => {
    expect(readPaymentsConfig({ ...FULL, RAZORPAY_KEY_ID: "pk_live_123" })).toEqual({ enabled: false });
  });
  it("never throws, whatever the env holds", () => {
    expect(() => readPaymentsConfig({ PAYMENTS_ENABLED: "true" })).not.toThrow();
    expect(() => readSyncConfig({ FUND_EASY_SYNC_ENABLED: "true", FUND_EASY_SYNC_URL: "::" })).not.toThrow();
  });
});

describe("readSyncConfig", () => {
  const SYNC = {
    FUND_EASY_SYNC_ENABLED: "true",
    FUND_EASY_SYNC_URL: "https://fidguqathrzitfbpknrd.supabase.co/functions/v1/external-sync",
    STAIRWAY_SYNC_SECRET: "x".repeat(32),
    SUPABASE_SERVICE_ROLE_KEY: "service_role_key_value_000000",
  };
  it("needs the flag, an https URL, a 32+ character secret and the service role key", () => {
    expect(readSyncConfig(SYNC)).toEqual({
      enabled: true, url: SYNC.FUND_EASY_SYNC_URL, secret: SYNC.STAIRWAY_SYNC_SECRET, serviceRoleKey: SYNC.SUPABASE_SERVICE_ROLE_KEY,
    });
    expect(readSyncConfig({ ...SYNC, FUND_EASY_SYNC_URL: "http://example.com/x" })).toEqual({ enabled: false });
    expect(readSyncConfig({ ...SYNC, FUND_EASY_SYNC_URL: "not a url" })).toEqual({ enabled: false });
    expect(readSyncConfig({ ...SYNC, STAIRWAY_SYNC_SECRET: "short" })).toEqual({ enabled: false });
    expect(readSyncConfig({ ...SYNC, FUND_EASY_SYNC_ENABLED: "false" })).toEqual({ enabled: false });
  });
});

describe("readCronSecret", () => {
  it("returns a 32+ character secret or null", () => {
    expect(readCronSecret({ CRON_SECRET: "c".repeat(32) })).toBe("c".repeat(32));
    expect(readCronSecret({ CRON_SECRET: "short" })).toBeNull();
    expect(readCronSecret({})).toBeNull();
  });
});
