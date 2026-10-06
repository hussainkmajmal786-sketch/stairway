import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

describe("updateSession", () => {
  it("passes anonymous requests straight through without touching Supabase", async () => {
    const res = await updateSession(new NextRequest("http://localhost/events/x"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
