// One vocabulary for a worker's day, shared by the attendance register, the shift board and their legends,
// so a status always has the same icon, colour and words. Status colours are semantic only; blue stays the brand.
// The `text` class is the readable ink shade (4.5:1 on white) for words, numbers and icons; `soft` and `solid` are the hue, for fills.
import { Check, CircleDashed, CircleDot, Clock3, Flag, LogOut, Moon, X, type LucideIcon } from "lucide-react";
import type { DayStatus } from "@/lib/attendance";
import { cx } from "@/lib/cx";

export { statusOf, type DayStatus } from "@/lib/attendance";

export const STATUS: Record<DayStatus, { label: string; icon: LucideIcon; text: string; soft: string; solid: string }> = {
  PRESENT: { label: "Present", icon: Check, text: "text-status-present-ink", soft: "bg-status-present/12", solid: "bg-status-present" },
  LATE: { label: "Late", icon: Clock3, text: "text-status-late-ink", soft: "bg-status-late/15", solid: "bg-status-late" },
  MISSING_OUT: { label: "Missing OUT", icon: LogOut, text: "text-status-missing-ink", soft: "bg-status-missing/14", solid: "bg-status-missing" },
  ABSENT: { label: "Absent", icon: X, text: "text-status-absent-ink", soft: "bg-status-absent/12", solid: "bg-status-absent" },
  ON_DUTY: { label: "On duty now", icon: CircleDot, text: "text-status-onduty-ink", soft: "bg-status-onduty/12", solid: "bg-status-onduty" },
  UPCOMING: { label: "Not started", icon: CircleDashed, text: "text-muted-foreground", soft: "bg-muted", solid: "bg-muted-foreground" },
  REST: { label: "Week off / rest", icon: Moon, text: "text-status-rest-ink", soft: "bg-status-rest/10", solid: "bg-status-rest" },
  HOLIDAY: { label: "Holiday", icon: Flag, text: "text-status-holiday-ink", soft: "bg-status-holiday/12", solid: "bg-status-holiday" },
};

/** Statuses in legend order. */
export const STATUS_ORDER: DayStatus[] = ["PRESENT", "LATE", "MISSING_OUT", "ABSENT", "ON_DUTY", "UPCOMING", "REST", "HOLIDAY"];

export function StatusIcon({ status, className, label = false }: { status: DayStatus; className?: string; label?: boolean }) {
  const m = STATUS[status];
  const Icon = m.icon;
  return (
    <span className={cx("inline-flex items-center gap-1.5", className)}>
      <Icon className={cx("size-4 shrink-0", m.text)} strokeWidth={2.25} aria-hidden={label ? true : undefined} aria-label={label ? undefined : m.label} role={label ? undefined : "img"} />
      {label && <span>{m.label}</span>}
    </span>
  );
}

export function StatusLegend({ statuses = STATUS_ORDER, extra, className }: { statuses?: DayStatus[]; extra?: React.ReactNode; className?: string }) {
  return (
    <ul className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground", className)} aria-label="Legend">
      {statuses.map((s) => (
        <li key={s}>
          <StatusIcon status={s} label />
        </li>
      ))}
      {extra}
    </ul>
  );
}
