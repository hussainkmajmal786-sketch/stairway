"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Linkedin, Whatsapp } from "./BrandIcons";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { track } from "@/lib/analytics";

/** WhatsApp, LinkedIn and copy-link (Instagram-story friendly) sharing. */
export function ShareButtons({ path, text }: { path: string; text: string }) {
  const { settings: event } = useSiteData();
  const url = `${event.siteUrl}${path}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      track("share", { channel: "copy", path });
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="flex flex-wrap gap-2">
      <a className="btn btn-sm btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => track("share", { channel: "whatsapp", path })}>
        <Whatsapp size={16} /> WhatsApp
      </a>
      <a className="btn btn-sm btn-secondary" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" onClick={() => track("share", { channel: "linkedin", path })}>
        <Linkedin size={16} /> LinkedIn
      </a>
      <button className="btn btn-sm btn-secondary" onClick={copy} aria-live="polite">
        {copied ? <Check size={16} strokeWidth={2} /> : <Link2 size={16} strokeWidth={2} />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
