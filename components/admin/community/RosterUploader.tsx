"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { importRosterChunk } from "@/lib/community/membership-admin-actions";
import { MAX_ROSTER_CHARS, chunkRows, parseRosterCsv, type RosterParseResult } from "@/lib/community/roster-csv";

/**
 * The file is parsed HERE, in the browser. Only the parsed {n, e, name} rows leave it, in chunks of 1000 (the database
 * hashes them on arrival). Numbers and names are never logged or kept after the import.
 */
export default function RosterUploader() {
  const router = useRouter();
  const id = useId();
  const [parsed, setParsed] = useState<RosterParseResult | null>(null);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function onFile(f: File | undefined) {
    setResult(null);
    setError(null);
    setParsed(null);
    if (!f) return;
    if (f.size > MAX_ROSTER_CHARS) {
      setError("That file is too large (2 MB at most).");
      return;
    }
    try {
      setParsed(parseRosterCsv(await f.text()));
    } catch {
      setError("We could not read that file.");
    }
  }

  async function run() {
    if (!parsed || parsed.rows.length === 0 || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    const chunks = chunkRows(parsed.rows, 1000);
    let rows = 0, extended = 0, autoVerified = 0;
    try {
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Importing part ${i + 1} of ${chunks.length}…`);
        const r = await importRosterChunk({ rows: chunks[i], replace: replace && i === 0 });
        if (!r.ok) {
          setError(`Stopped at part ${i + 1} of ${chunks.length}: ${r.error.message} Parts already imported stay in place.`);
          return;
        }
        rows += r.data.rows;
        extended += r.data.extended;
        autoVerified += r.data.autoVerified;
      }
      setResult(`Imported ${rows} rows. ${extended} memberships extended, ${autoVerified} pending claims verified.`);
      setParsed(null);
      router.refresh();
    } catch {
      setError("The import was interrupted. Parts already imported stay in place.");
    } finally {
      inFlight.current = false;
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <div className="grid gap-4">
      <Field id={id} label="Roster file (CSV)" hint="Columns: member number, expiry date, name. The file is read in your browser; only the rows are sent.">
        <input
          id={id} type="file" accept=".csv,text/csv" disabled={busy}
          className="block w-full border-2 border-ink bg-white p-3 text-sm file:mr-3 file:border-2 file:border-ink file:bg-yellow file:px-3 file:py-2 file:font-mono file:text-xs file:font-bold file:uppercase"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </Field>
      {parsed && (
        <div className="box-2 grid gap-2 p-4" aria-live="polite">
          <p className="font-semibold">{parsed.rows.length} valid rows, {parsed.errors.length} with problems.</p>
          {parsed.errors.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-ink-2">
              {parsed.errors.slice(0, 5).map((e) => (
                <li key={`${e.line}-${e.reason}`}>{e.line > 0 ? `Line ${e.line}: ` : ""}{e.reason}</li>
              ))}
              {parsed.errors.length > 5 && <li>…and {parsed.errors.length - 5} more.</li>}
            </ul>
          )}
        </div>
      )}
      <label className="flex items-center gap-3 font-semibold">
        <input type="checkbox" className="h-5 w-5 accent-[var(--ink)]" checked={replace} disabled={busy} onChange={(e) => setReplace(e.target.checked)} />
        Replace the existing roster
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={busy || !parsed || parsed.rows.length === 0} onClick={() => void run()}>
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Upload size={16} strokeWidth={2} aria-hidden />} Import roster
        </button>
        <p role="status" aria-live="polite" className="text-sm font-semibold">{progress || result}</p>
      </div>
      {error && <p role="alert" className="font-semibold text-red-ink">{error}</p>}
    </div>
  );
}
