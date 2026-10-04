import { Heading } from "./Heading";

export function PageHero({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="pb-10 pt-14 md:pb-14 md:pt-20">
      <div className="wrap">
        <p className="eyebrow mb-5" data-reveal>{eyebrow}</p>
        <Heading as="h1" text={title} className="max-w-[18ch] text-[clamp(2.6rem,7vw,5.5rem)] font-medium leading-[0.98] tracking-[-0.04em]" />
        {lead && <p className="lead mt-6" data-reveal>{lead}</p>}
      </div>
    </header>
  );
}
