"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { attachEventMediaAction } from "@/lib/admin/media-actions";
import {
  saveEventContentAction, saveEventQuestionsAction, saveEventResourcesAction, saveEventSpeakersAction,
} from "@/lib/admin/event-extras-actions";
import { finalizeQuestions } from "@/lib/admin/questions-builder";
import { parseVideoUrl } from "@/lib/admin/video";
import { QuestionSchema, type Question } from "@/lib/registration/questions";
import type { AdminError, ActionResult } from "@/lib/admin/result";
import { Field, inputCls } from "@/components/ui/Field";
import { AgendaEditor, StringListEditor, type AgendaDraft } from "./AgendaEditor";
import { ListEditor } from "./ListEditor";
import { MediaUploader } from "./MediaUploader";
import { QuestionsBuilder } from "./QuestionsBuilder";
import { SpeakerPicker, type SpeakerOption } from "./SpeakerPicker";

export interface ResourcesDraft {
  slides: string;
  code: string;
  notebook: string;
  recording: string;
  reading: { label: string; href: string }[];
}
export interface WinnerDraft {
  place: string;
  team: string;
  project: string;
}

export interface EventExtrasProps {
  eventId: string;
  updatedAt: string;
  disabled: boolean;
  posterUrl: string | null;
  videoUrl: string | null;
  agenda: AgendaDraft[];
  outcomes: string[];
  prerequisites: string[];
  bring: string[];
  speakerIds: string[];
  speakerOptions: SpeakerOption[];
  questions: Question[];
  lockedIds: string[];
  hasRegistrations: boolean;
  resources: ResourcesDraft;
  winners: WinnerDraft[];
}

/** Per-section save state: pending flag, an alert, and a polite status line. */
function useSection() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<AdminError | null>(null);
  const [note, setNote] = useState("");
  const run = <T,>(fn: () => Promise<ActionResult<T>>, onOk: (data: T) => void, message = "Saved.") => {
    setError(null);
    setNote("");
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNote(message);
      onOk(r.data);
    });
  };
  return { pending, error, note, run };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="box shadow-hard">
      <h2 id={id} className="mono border-b-2 border-ink bg-paper-2 px-5 py-3 font-bold">
        {title}
      </h2>
      <div className="grid gap-5 p-5">{children}</div>
    </section>
  );
}

function SaveRow({ s, label = "Save", disabled }: { s: ReturnType<typeof useSection>; label?: string; disabled?: boolean }) {
  return (
    <div className="grid gap-3">
      {s.error && (
        <div role="alert" className="border-2 border-red-ink bg-error-bg p-3 font-semibold text-red-ink">
          <p>{s.error.message}</p>
          {s.error.fieldErrors && (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {Object.entries(s.error.fieldErrors).map(([k, m]) => (
                <li key={k}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary btn-sm" disabled={s.pending || disabled}>
          {s.pending ? "Saving…" : label}
        </button>
        <p aria-live="polite" className="text-sm font-semibold">
          {s.note}
        </p>
      </div>
    </div>
  );
}

export function EventExtras(p: EventExtrasProps) {
  const router = useRouter();
  const [seen, setSeen] = useState(p.updatedAt);
  const [lastProp, setLastProp] = useState(p.updatedAt);
  if (p.updatedAt !== lastProp) {
    setLastProp(p.updatedAt);
    setSeen(p.updatedAt);
  }
  const done = (r: { updatedAt: string }) => {
    setSeen(r.updatedAt);
    router.refresh();
  };

  // media
  const media = useSection();
  const [poster, setPoster] = useState(p.posterUrl ?? "");
  const [video, setVideo] = useState(p.videoUrl ?? "");
  const videoInfo = video.trim() === "" ? null : parseVideoUrl(video);

  // content
  const content = useSection();
  const [agenda, setAgenda] = useState(p.agenda);
  const [outcomes, setOutcomes] = useState(p.outcomes);
  const [prerequisites, setPrerequisites] = useState(p.prerequisites);
  const [bring, setBring] = useState(p.bring);

  // speakers
  const speakers = useSection();
  const [speakerIds, setSpeakerIds] = useState(p.speakerIds);

  // questions
  const questionsSec = useSection();
  const [questions, setQuestions] = useState(p.questions);
  const [qErrors, setQErrors] = useState<Record<number, string>>({});
  const locked = new Set(p.lockedIds);

  // resources
  const res = useSection();
  const [resources, setResources] = useState(p.resources);
  const [winners, setWinners] = useState(p.winners);

  const attach = (field: "poster" | "video", url: string) =>
    media.run(
      () => attachEventMediaAction({ eventId: p.eventId, field, url, seenUpdatedAt: seen }),
      (r) => {
        if (field === "poster") setPoster(r.url ?? "");
        else setVideo(r.url ?? "");
        done(r);
      },
      field === "poster" ? "Poster updated." : "Video updated.",
    );

  return (
    <div className="grid gap-8">
      <Section id="x-media" title="Poster and video">
        <MediaUploader
          kind="poster"
          label="Poster image"
          target={{ eventId: p.eventId }}
          currentUrl={poster || null}
          disabled={p.disabled || media.pending}
          onUploaded={(url) => attach("poster", url)}
        />
        {poster && (
          <button type="button" className="btn btn-secondary btn-sm justify-self-start" disabled={p.disabled || media.pending} onClick={() => attach("poster", "")}>
            Remove poster
          </button>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            attach("video", video.trim());
          }}
          className="grid gap-3"
        >
          <Field id="x-video" label="Video link" hint="YouTube, Vimeo or a direct .mp4/.webm link (https only).">
            <input id="x-video" className={inputCls} value={video} disabled={p.disabled || media.pending} onChange={(e) => setVideo(e.target.value)} aria-describedby="x-video-hint x-video-chip" />
          </Field>
          <p id="x-video-chip" aria-live="polite" className="text-sm font-semibold">
            {video.trim() === "" ? "No video." : videoInfo ? `Looks good: ${videoInfo.kind === "direct" ? "direct file" : videoInfo.kind}.` : "Not a supported video link."}
          </p>
          <SaveRow s={media} label="Save video link" disabled={p.disabled || (video.trim() !== "" && !videoInfo)} />
        </form>
        <MediaUploader
          kind="video"
          label="Or upload a video file instead"
          target={{ eventId: p.eventId }}
          disabled={p.disabled || media.pending}
          onUploaded={(url) => attach("video", url)}
        />
      </Section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          content.run(
            () =>
              saveEventContentAction({
                id: p.eventId,
                seenUpdatedAt: seen,
                agenda: agenda.map((a) => ({ time: a.time, title: a.title, ...(a.detail.trim() ? { detail: a.detail } : {}) })),
                outcomes: outcomes.filter((x) => x.trim() !== ""),
                prerequisites: prerequisites.filter((x) => x.trim() !== ""),
                bring: bring.filter((x) => x.trim() !== ""),
              }),
            done,
          );
        }}
      >
        <Section id="x-content" title="Agenda and lists">
          <div>
            <h3 className="mono mb-2 font-bold">Agenda</h3>
            <AgendaEditor idPrefix="x-agenda" items={agenda} onChange={setAgenda} disabled={p.disabled} />
          </div>
          <div>
            <h3 className="mono mb-2 font-bold">What you will learn</h3>
            <StringListEditor idPrefix="x-out" noun="outcome" items={outcomes} onChange={setOutcomes} disabled={p.disabled} />
          </div>
          <div>
            <h3 className="mono mb-2 font-bold">Prerequisites</h3>
            <StringListEditor idPrefix="x-pre" noun="prerequisite" items={prerequisites} onChange={setPrerequisites} disabled={p.disabled} />
          </div>
          <div>
            <h3 className="mono mb-2 font-bold">What to bring</h3>
            <StringListEditor idPrefix="x-bring" noun="item" items={bring} onChange={setBring} disabled={p.disabled} />
          </div>
          <SaveRow s={content} label="Save agenda and lists" disabled={p.disabled} />
        </Section>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          speakers.run(
            () => saveEventSpeakersAction({ id: p.eventId, speakerIds }),
            () => router.refresh(),
          );
        }}
      >
        <Section id="x-speakers" title="Speakers">
          <SpeakerPicker options={p.speakerOptions} value={speakerIds} onChange={setSpeakerIds} disabled={p.disabled} />
          <SaveRow s={speakers} label="Save speakers" disabled={p.disabled} />
        </Section>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const finalized = finalizeQuestions(questions, locked);
          const errs: Record<number, string> = {};
          finalized.forEach((q, i) => {
            const r = QuestionSchema.safeParse(q);
            if (!r.success) errs[i] = r.error.issues[0]?.message ?? "Check this question.";
          });
          if (Object.keys(errs).length > 0) {
            setQErrors(errs);
            questionsSec.run(async () => ({ ok: false as const, error: { code: "invalid_input" as const, message: "Fix the highlighted questions first." } }), () => undefined);
            return;
          }
          setQErrors({});
          questionsSec.run(
            () => saveEventQuestionsAction({ id: p.eventId, seenUpdatedAt: seen, questions: finalized }),
            (r) => {
              setQuestions(finalized);
              done(r);
            },
          );
        }}
      >
        <Section id="x-questions" title="Registration questions">
          {p.hasRegistrations && (
            <p className="border-2 border-ink bg-yellow p-3 text-sm font-semibold">
              People have already registered. Changes apply to new registrations only, and questions that already have answers keep their type.
            </p>
          )}
          <QuestionsBuilder value={questions} onChange={setQuestions} lockedIds={locked} errors={qErrors} disabled={p.disabled} />
          <SaveRow s={questionsSec} label="Save questions" disabled={p.disabled} />
        </Section>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          res.run(
            () =>
              saveEventResourcesAction({
                id: p.eventId,
                seenUpdatedAt: seen,
                resources: {
                  slides: resources.slides.trim(),
                  code: resources.code.trim(),
                  notebook: resources.notebook.trim(),
                  recording: resources.recording.trim(),
                  reading: resources.reading.filter((r) => r.label.trim() || r.href.trim()),
                },
                winners: winners.filter((w) => w.place.trim() || w.team.trim() || w.project.trim()),
              }),
            done,
          );
        }}
      >
        <Section id="x-resources" title="After the session: resources and winners">
          <div className="grid gap-4 sm:grid-cols-2">
            {(["slides", "code", "notebook", "recording"] as const).map((k) => (
              <Field key={k} id={`x-res-${k}`} label={k[0].toUpperCase() + k.slice(1) + " link"} hint="https:// only">
                <input id={`x-res-${k}`} className={inputCls} value={resources[k]} disabled={p.disabled} onChange={(e) => setResources({ ...resources, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
          <div>
            <h3 className="mono mb-2 font-bold">Further reading</h3>
            <ListEditor
              items={resources.reading}
              onChange={(reading) => setResources({ ...resources, reading })}
              noun="reading link"
              max={20}
              disabled={p.disabled}
              newItem={() => ({ label: "", href: "" })}
              renderRow={(item, i, update) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id={`x-read-${i}-label`} label="Label">
                    <input id={`x-read-${i}-label`} className={inputCls} maxLength={80} value={item.label} onChange={(e) => update({ ...item, label: e.target.value })} />
                  </Field>
                  <Field id={`x-read-${i}-href`} label="Link">
                    <input id={`x-read-${i}-href`} className={inputCls} maxLength={500} value={item.href} onChange={(e) => update({ ...item, href: e.target.value })} />
                  </Field>
                </div>
              )}
            />
          </div>
          <div>
            <h3 className="mono mb-2 font-bold">Winners</h3>
            <ListEditor
              items={winners}
              onChange={setWinners}
              noun="winner"
              max={10}
              disabled={p.disabled}
              newItem={() => ({ place: "", team: "", project: "" })}
              renderRow={(item, i, update) => (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field id={`x-win-${i}-place`} label="Place">
                    <input id={`x-win-${i}-place`} className={inputCls} maxLength={40} value={item.place} onChange={(e) => update({ ...item, place: e.target.value })} />
                  </Field>
                  <Field id={`x-win-${i}-team`} label="Team">
                    <input id={`x-win-${i}-team`} className={inputCls} maxLength={80} value={item.team} onChange={(e) => update({ ...item, team: e.target.value })} />
                  </Field>
                  <Field id={`x-win-${i}-project`} label="Project">
                    <input id={`x-win-${i}-project`} className={inputCls} maxLength={120} value={item.project} onChange={(e) => update({ ...item, project: e.target.value })} />
                  </Field>
                </div>
              )}
            />
          </div>
          <SaveRow s={res} label="Save resources and winners" disabled={p.disabled} />
        </Section>
      </form>
    </div>
  );
}
