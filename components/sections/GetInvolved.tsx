"use client";

import { useEffect, useState } from "react";
import { Handshake } from "lucide-react";
import { CommunityForm } from "@/components/community/CommunityForm";
import { KindTabs } from "@/components/community/KindTabs";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { KINDS, hashForKind, kindFromHash, type FormKind } from "@/lib/community/form-ui";

const P = "gi";

/** Home-page band with the three request forms. Cream (paper-2) so the forms never sit on cobalt. */
export function GetInvolved() {
  const [kind, setKind] = useState<FormKind>("host_event");

  // Footer links use /#host-event, /#partner, /#feedback: follow the hash on load and on hash changes.
  useEffect(() => {
    const sync = () => {
      const k = kindFromHash(window.location.hash);
      if (k) setKind(k);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  function choose(k: FormKind) {
    setKind(k);
    try {
      history.replaceState(null, "", `#${hashForKind(k)}`);
    } catch {
      // history can be unavailable in sandboxed frames; the tab still switches
    }
  }

  return (
    <section id="get-involved" aria-labelledby="get-involved-title" className="section-alt scroll-mt-28">
      {/* anchors for the footer links; the real target is the section itself */}
      <span id="host-event" className="scroll-mt-28" />
      <span id="partner" className="scroll-mt-28" />
      <span id="feedback" className="scroll-mt-28" />
      <div className="wrap py-[clamp(56px,8vw,112px)]">
        <SectionHeader
          id="get-involved-title"
          eyebrow="Get involved"
          Icon={Handshake}
          title="Get [[involved.]]"
          lead="Want to host a session, partner with us, or tell us what to improve? Pick a form — a human reads every message."
        />
        <div className="grid gap-6 lg:max-w-3xl">
          <KindTabs value={kind} onChange={choose} idPrefix={P} />
          {KINDS.map((k) => (
            <div
              key={k.kind}
              role="tabpanel"
              id={`${P}-panel-${k.kind}`}
              aria-labelledby={`${P}-tab-${k.kind}`}
              hidden={k.kind !== kind}
              tabIndex={-1}
            >
              <CommunityForm kind={k.kind} idPrefix={P} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
