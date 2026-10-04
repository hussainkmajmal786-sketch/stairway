import Link from "next/link";
import { ArrowUp } from "lucide-react";

export default function NotFound() {
  return (
    <section className="py-16 md:py-24" aria-labelledby="nf-title">
      <div className="wrap grid items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="tag tag-red">Error 404 · Step not found</span>
          <h1 id="nf-title" className="mt-5 text-[clamp(3rem,8vw,6rem)] font-medium leading-[0.95] tracking-[-0.04em]">
            You fell off the <mark className="bg-yellow px-1 text-inherit">stairway.</mark>
          </h1>
          <p className="lead mt-6">The page you were climbing to doesn&apos;t exist — or it hasn&apos;t been built yet.</p>
          <Link href="/" className="btn btn-primary btn-lg mt-10">
            <ArrowUp size={18} strokeWidth={2} /> Climb back up
          </Link>
        </div>
        {/* a staircase with its top two steps knocked loose */}
        <svg viewBox="0 0 400 320" className="mx-auto w-full max-w-md" aria-hidden>
          {[0, 1, 2].map((i) => (
            <rect key={i} x={20 + i * 70} y={250 - i * 50} width="70" height={68 + i * 50} fill={i === 2 ? "#FFB200" : "#ECE4D7"} stroke="#100F0D" strokeWidth="3" />
          ))}
          <rect x="250" y="120" width="70" height="26" fill="#FF5A5A" stroke="#100F0D" strokeWidth="3" transform="rotate(18 285 133)" />
          <rect x="300" y="190" width="70" height="26" fill="#ECE4D7" stroke="#100F0D" strokeWidth="3" transform="rotate(-24 335 203)" />
          <rect x="196" y="160" width="16" height="16" fill="#2A8CFF" stroke="#100F0D" strokeWidth="3" />
        </svg>
      </div>
    </section>
  );
}
