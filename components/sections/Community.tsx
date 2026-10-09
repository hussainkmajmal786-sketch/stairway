"use client";

import { useState } from "react";
import { ArrowRight, Bell, Check, Loader2 } from "lucide-react";
import { useSiteData } from "@/components/providers/SiteDataProvider";
import { Instagram, Linkedin, Whatsapp } from "@/components/ui/BrandIcons";
import { Heading } from "@/components/ui/Heading";
import { track } from "@/lib/analytics";

export function Community() {
  const { settings: event } = useSiteData();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setState("error");
      setMsg("That email doesn't look right — mind checking it?");
      return;
    }
    setState("loading");
    try {
      if (event.newsletter.endpoint) {
        const res = await fetch(event.newsletter.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) throw new Error();
        setMsg("You're on the list. We'll ping you before every step.");
      } else {
        await new Promise((r) => setTimeout(r, 500));
        setMsg("Demo mode: no newsletter endpoint is connected yet (set newsletter.endpoint in the site settings).");
      }
      track("newsletter_signup");
      setState("done");
    } catch {
      setState("error");
      setMsg("Something went wrong. Try again, or join the WhatsApp group instead.");
    }
  };

  const card = "box lift flex items-center gap-3 p-4 shadow-hard";

  return (
    <section id="community" aria-labelledby="community-title" className="section">
      <div className="wrap grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="eyebrow mb-4" data-reveal><Bell size={16} strokeWidth={2} aria-hidden /> Newsletter &amp; community</p>
          <Heading id="community-title" text="Never miss a [[step.]]" rule="left" className="h2" />
          <p className="lead mt-5" data-reveal>Weekly reminders, resources and first dibs on seats. Or skip the inbox and join 500+ climbers on WhatsApp.</p>
        </div>
        <div className="flex flex-col gap-5" data-reveal>
          <form onSubmit={submit} noValidate>
            <label htmlFor="nl-email" className="mono mb-2 block font-bold">Email address</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="nl-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (state === "error") setState("idle");
                }}
                placeholder="you@college.edu"
                aria-invalid={state === "error"}
                aria-describedby="nl-msg"
                className="h-[52px] flex-1 border-2 border-ink bg-paper px-4 shadow-[3px_3px_0_0_var(--ink)] outline-none placeholder:text-ink-4 focus:bg-paper-2 aria-[invalid=true]:bg-red/20"
              />
              <button type="submit" className="btn btn-primary" disabled={state === "loading"}>
                {state === "loading" ? <Loader2 size={18} className="animate-spin" /> : state === "done" ? <Check size={18} /> : <ArrowRight size={18} strokeWidth={2} />}
                {state === "done" ? "Subscribed" : "Notify me"}
              </button>
            </div>
            <p id="nl-msg" role="status" className={state === "error" ? "mt-2 text-sm font-semibold text-red-ink" : "mt-2 text-sm text-ink-3"}>{msg}</p>
          </form>
          <div className="grid gap-3 sm:grid-cols-3">
            <a href={event.social.whatsapp} target="_blank" rel="noopener noreferrer" className={`${card} bg-green`} onClick={() => track("community_join", { channel: "whatsapp" })}>
              <Whatsapp size={24} />
              <span><span className="block font-semibold">WhatsApp</span><span className="text-xs">Join the community</span></span>
            </a>
            <a href={event.social.instagram} target="_blank" rel="noopener noreferrer" className={card}>
              <Instagram size={24} />
              <span><span className="block font-semibold">Instagram</span><span className="text-xs text-ink-3">Highlights</span></span>
            </a>
            <a href={event.social.linkedin} target="_blank" rel="noopener noreferrer" className={card}>
              <Linkedin size={24} />
              <span><span className="block font-semibold">LinkedIn</span><span className="text-xs text-ink-3">News</span></span>
            </a>
          </div>
          <a href={event.volunteerFormUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center self-start font-semibold underline underline-offset-4 hover:bg-yellow">
            Want to volunteer? Apply here →
          </a>
        </div>
      </div>
    </section>
  );
}
