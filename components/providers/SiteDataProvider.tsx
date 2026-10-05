"use client";

import { createContext, useContext } from "react";
import type { SiteData } from "@/lib/site/types";

const SiteDataContext = createContext<SiteData | null>(null);

export function SiteDataProvider({ data, children }: { data: SiteData; children: React.ReactNode }) {
  return <SiteDataContext.Provider value={data}>{children}</SiteDataContext.Provider>;
}

export function useSiteData() {
  const ctx = useContext(SiteDataContext);
  if (!ctx) throw new Error("useSiteData must be used inside <SiteDataProvider>");
  return ctx;
}
