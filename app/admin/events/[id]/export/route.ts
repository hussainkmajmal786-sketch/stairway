import { exportRegistrations } from "@/lib/admin/export";

export const dynamic = "force-dynamic";

// CSV of an event's registrations. Authorised inside exportRegistrations (404 for everyone who may not see the event).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const answers = new URL(request.url).searchParams.get("answers") === "1";
  return exportRegistrations(id, answers);
}
