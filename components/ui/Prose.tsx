/** Long-form text styling for legal and policy pages. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap pb-[var(--section-y)]">
      <div className="box max-w-3xl space-y-5 p-6 text-ink-2 shadow-hard md:p-10 [&_a]:font-semibold [&_a]:text-blue-ink [&_a]:underline [&_h2]:mt-10 [&_h2]:font-mono [&_h2]:text-xl [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-[0.06em] [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-[square] [&_strong]:text-ink">
        {children}
      </div>
    </div>
  );
}
