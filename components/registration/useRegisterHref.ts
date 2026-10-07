"use client";

import { useCallback } from "react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { registerHref } from "@/lib/weekends";

/** registerHref bound to the site's registration settings (external Google Form mode included). */
export function useRegisterHref() {
  const { settings } = useSiteData();
  const reg = settings.registration;
  return useCallback((slug?: string | null) => registerHref(slug, reg), [reg]);
}
