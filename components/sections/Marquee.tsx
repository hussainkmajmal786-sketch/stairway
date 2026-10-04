const TOPICS = [
  ["Machine Learning", "tag-green"],
  ["Deep Learning", "tag-blue"],
  ["Computer Vision", "tag-yellow"],
  ["NLP", "tag-red"],
  ["LLMs", "tag-purple"],
  ["AI Agents", "tag-orange"],
  ["Generative AI", "tag-blue"],
  ["Prompt Engineering", "tag-green"],
  ["AI Ethics", "tag-yellow"],
  ["Edge AI", "tag-red"],
] as const;

/** Ticker of topic tags; pauses on hover, static under reduced motion. */
export function Marquee() {
  const row = (hidden: boolean) => (
    <ul className="marquee-track" aria-hidden={hidden || undefined}>
      {TOPICS.map(([t, c]) => (
        <li key={t} className="flex items-center gap-4">
          <span className={`tag ${c} !px-3 !py-1.5 !text-[0.78rem]`}>{t}</span>
          <span className="font-mono text-ink-4" aria-hidden>{"<>"}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="border-b-2 border-ink bg-paper py-3" role="region" aria-label="Topics covered">
      <div className="marquee" style={{ ["--speed" as string]: "55s" }}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
