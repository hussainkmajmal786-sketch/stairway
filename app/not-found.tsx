import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { FieldBand } from "@/components/ui/Poster";
import { ghostWord } from "@/lib/design/ghost";
import { TOKENS } from "@/lib/design/tokens";

/** 404 as a poster: cobalt field, CLIMB ghost (general page), extruded Anton title, a staircase with loose steps. */
export default function NotFound() {
  return (
    <FieldBand labelledBy="nf-title" ghost={ghostWord({ kind: "general" })} bands="top" className="border-b-2 border-ink pb-[clamp(80px,12vw,140px)] pt-[clamp(96px,14vw,160px)]">
      <div className="wrap grid items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="tag tag-red">Error 404 · Step not found</span>
          <h1 id="nf-title" className="h-display extrude mt-5 break-words pt-[0.14em] text-[clamp(3rem,8vw,6rem)]">
            You fell off the <span className="text-yellow">stairway.</span>
          </h1>
          <p className="lead mt-6">The page you were climbing to doesn&apos;t exist — or it hasn&apos;t been built yet.</p>
          <Link href="/" className="btn btn-primary btn-lg mt-10">
            <ArrowUp size={18} strokeWidth={2} aria-hidden /> Climb back up
          </Link>
        </div>
        {/* a staircase with its top two steps knocked loose */}
        <svg viewBox="0 0 400 320" className="mx-auto w-full max-w-md" aria-hidden>
          {[0, 1, 2].map((i) => (
            <rect key={i} x={20 + i * 70} y={250 - i * 50} width="70" height={68 + i * 50} fill={i === 2 ? TOKENS.yellow : TOKENS.paper} stroke={TOKENS.ink} strokeWidth="3" />
          ))}
          <rect x="250" y="120" width="70" height="26" fill={TOKENS.red} stroke={TOKENS.ink} strokeWidth="3" transform="rotate(18 285 133)" />
          <rect x="300" y="190" width="70" height="26" fill={TOKENS.paper} stroke={TOKENS.ink} strokeWidth="3" transform="rotate(-24 335 203)" />
          <rect x="196" y="160" width="16" height="16" fill={TOKENS.blue} stroke={TOKENS.ink} strokeWidth="3" />
        </svg>
      </div>
    </FieldBand>
  );
}
