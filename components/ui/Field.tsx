import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputCls =
  "h-12 w-full border-2 border-ink bg-paper px-4 outline-none placeholder:text-ink-4 focus:bg-paper-2 focus:shadow-[3px_3px_0_0_var(--ink)] aria-[invalid=true]:bg-red/15";
export const textareaCls = cn(inputCls, "h-auto min-h-28 py-3");

export function Field({
  id, label, error, hint, required = false, children, className,
}: {
  id: string; label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mono mb-2 block font-bold">
        {label}
        {required && <span className="ml-0.5 text-red-ink" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>}
      {error && (
        <p id={`${id}-err`} className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-ink">
          <AlertCircle size={14} strokeWidth={2} aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}
