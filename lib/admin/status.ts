import type { PaymentsStatus } from "@/lib/payments/config";

export interface StatusRow {
  key: string;
  label: string;
  ok: boolean;
  /** Word shown next to the icon; never a secret value. */
  word: string;
}

const configured = (ok: boolean) => (ok ? "Configured" : "Missing");

/** Maps presence booleans to panel rows. `dbFlag` is null when the database could not be read. */
export function statusRows(s: PaymentsStatus, dbFlag: boolean | null): StatusRow[] {
  return [
    { key: "env-flag", label: "Payments switched on in the environment", ok: s.envFlag, word: s.envFlag ? "On" : "Off" },
    {
      key: "db-flag", label: "Payments switched on in the database", ok: dbFlag === true,
      word: dbFlag === null ? "Unknown" : dbFlag ? "On" : "Off",
    },
    {
      key: "key-id", label: "Razorpay key id", ok: s.keyIdPresent,
      word: s.keyIdPresent ? `Configured (${s.keyMode} mode)` : "Missing",
    },
    { key: "key-secret", label: "Razorpay key secret", ok: s.keySecretPresent, word: configured(s.keySecretPresent) },
    { key: "webhook", label: "Razorpay webhook secret", ok: s.webhookSecretPresent, word: configured(s.webhookSecretPresent) },
    { key: "service-role", label: "Server database key", ok: s.serviceRolePresent, word: configured(s.serviceRolePresent) },
    { key: "cron", label: "Scheduled-job secret", ok: s.cronSecretPresent, word: configured(s.cronSecretPresent) },
    { key: "sync-flag", label: "Fund Easy sync switched on", ok: s.syncFlag, word: s.syncFlag ? "On" : "Off" },
    { key: "sync", label: "Fund Easy sync configured", ok: s.syncConfigured, word: configured(s.syncConfigured) },
  ];
}
