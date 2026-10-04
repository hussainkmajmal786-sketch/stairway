import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { Prose } from "@/components/ui/Prose";
import { event } from "@/data/event";

export const metadata: Metadata = {
  title: "Code of Conduct",
  description: "How we keep st(AI)rway safe, welcoming and harassment-free for every participant.",
  alternates: { canonical: "/code-of-conduct" },
};

export default function CodeOfConduct() {
  return (
    <>
      <PageHero eyebrow="Code of Conduct" title="Everyone climbs [[together.]]" lead="st(AI)rway is for every student. These rules keep it that way." />
      <Prose>
        <p>All participants, speakers, mentors, sponsors and volunteers at st(AI)rway events — in person and online — agree to this Code of Conduct. It follows the IEEE Code of Conduct and the IEEE Code of Ethics.</p>
        <h2>Our commitment</h2>
        <p>We are dedicated to a harassment-free experience for everyone, regardless of gender, gender identity, sexual orientation, disability, appearance, body size, race, ethnicity, religion, caste, region, language, branch, year of study or level of experience.</p>
        <h2>Expected behaviour</h2>
        <ul>
          <li>Be respectful and kind. Beginners are the reason this series exists.</li>
          <li>Help others learn — explain, don&apos;t mock.</li>
          <li>Credit other people&apos;s work and code. No plagiarism in challenges or the hackathon.</li>
          <li>Respect the venue, equipment and the volunteers who run each weekend.</li>
          <li>Ask before photographing or recording someone up close.</li>
        </ul>
        <h2>Unacceptable behaviour</h2>
        <ul>
          <li>Harassment, intimidation, or discriminatory jokes and language.</li>
          <li>Unwelcome physical contact or sexual attention.</li>
          <li>Disrupting talks, labs or other participants&apos; work.</li>
          <li>Using AI tools to create deepfakes or harmful content of real people.</li>
        </ul>
        <h2>Reporting</h2>
        <p>If you experience or witness unacceptable behaviour, tell any organiser wearing a st(AI)rway badge, or email <a href={`mailto:${event.contact.email}`}>{event.contact.email}</a>. Reports are handled confidentially by the Branch Counselor and the organising committee.</p>
        <h2>Consequences</h2>
        <p>Organisers may take any action they consider appropriate, including a warning, removal from the event without refund, disqualification from competitions, and reporting to college authorities.</p>
      </Prose>
    </>
  );
}
