import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const metadata: Metadata = { title: "Your dashboard", robots: { index: false } };

// No auth guard here on purpose: layouts don't know the current path (so a guard here would
// send everyone back to /me after login) and don't re-render on client navigation. Every
// /me page calls requireOnboarded() with its own path instead; the shell renders no user data.
export default function MeLayout({ children }: LayoutProps<"/me">) {
  return <DashboardShell variant="me">{children}</DashboardShell>;
}
