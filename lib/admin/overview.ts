import { z } from "zod";

/** Shape of public.admin_overview(); parsed so a drifting RPC fails loudly instead of rendering garbage. */
export const OverviewSchema = z.object({
  upcoming: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      society: z.string(),
      starts_at: z.string(),
      status: z.enum(["draft", "published", "cancelled"]),
      capacity: z.number(),
      confirmed: z.number(),
      waitlisted: z.number(),
    }),
  ),
  registrations_7d: z.number(),
  fill_rate: z.number(),
  revenue_paise: z.number(),
  refunds_pending: z.number(),
  recent_checkins: z.array(z.object({ full_name: z.string(), event: z.string(), checked_in_at: z.string() })),
});
export type Overview = z.infer<typeof OverviewSchema>;
