import { RegistrantRow, type RegistrantView } from "./RegistrantRow";

/** Table at md and up; at phone width each row becomes a stacked card (no horizontal scroll). */
export function RegistrantsTable({ eventId, rows }: { eventId: string; rows: RegistrantView[] }) {
  if (rows.length === 0) return <p className="box p-5">No registrations match.</p>;
  return (
    <div className="box shadow-hard overflow-hidden max-md:border-0 max-md:shadow-none">
      <table className="w-full text-left max-md:block">
        <caption className="sr-only">Registrations</caption>
        <thead className="max-md:sr-only">
          <tr className="mono border-b-2 border-ink bg-paper-2 text-xs font-bold">
            <th scope="col" className="px-3 py-3">Token</th>
            <th scope="col" className="px-3 py-3">Person</th>
            <th scope="col" className="px-3 py-3">Status</th>
            <th scope="col" className="px-3 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-ink max-md:block max-md:divide-y-0">
          {rows.map((r) => (
            <RegistrantRow key={r.id} eventId={eventId} r={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
