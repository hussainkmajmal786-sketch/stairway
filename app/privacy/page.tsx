import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { Prose } from "@/components/ui/Prose";
import { event } from "@/data/event";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What data st(AI)rway collects, why, and how it's handled.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <>
      <PageHero eyebrow="Privacy policy" title="Your data, [[handled simply.]]" lead="Last updated: October 2026." />
      <Prose>
        <h2>What we collect</h2>
        <p>When you register we collect your name, email, phone number, college, branch, year, IEEE membership details, the weekends you select, your experience level and how you heard about us. If you subscribe to updates we store your email address.</p>
        <h2>Why we collect it</h2>
        <ul>
          <li>To confirm your seat, plan venues, food and materials.</li>
          <li>To issue certificates and update the leaderboard.</li>
          <li>To send reminders and resources for the weekends you registered for.</li>
        </ul>
        <h2>Who sees it</h2>
        <p>Only the IEEE SB CEK organising committee. We do <strong>not</strong> sell or share your personal data with sponsors. Sponsors may receive anonymised totals (for example, &ldquo;420 participants from 14 colleges&rdquo;).</p>
        <h2>Leaderboard & photos</h2>
        <p>The leaderboard shows first name, initial, branch and points. Event photos may appear in the gallery and on our social channels. To opt out of either, email us and we&apos;ll remove you.</p>
        <h2>Cookies & analytics</h2>
        <p>The site stores small preferences in your browser (such as a dismissed announcement). If analytics are enabled we use aggregate, privacy-friendly page statistics and do not build advertising profiles.</p>
        <h2>Retention & your rights</h2>
        <p>Registration data is kept until the end of the series plus one year for certificate verification, then deleted. You can ask to see, correct or delete your data at any time: <a href={`mailto:${event.contact.email}`}>{event.contact.email}</a>.</p>
      </Prose>
    </>
  );
}
