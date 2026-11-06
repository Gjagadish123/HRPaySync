"use client";

// App-level primitives built on shadcn/ui. Call sites keep one small API (Button kinds, Tag tones,
// Sheet open/onClose) while the look comes from the shadcn components in ./ui.
import { Lock } from "lucide-react";
import { useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button as UiButton, buttonVariants } from "@/components/ui/button";
import { Empty as EmptyFrame, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Sheet as UiSheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { cx } from "@/lib/cx";
import { fmtDur, toMin } from "@/lib/time";

export { cx };

type ButtonKind = "tape" | "plain" | "quiet" | "danger";
const VARIANT = { tape: "default", plain: "outline", quiet: "link", danger: "destructive" } as const;

/** Shared so links that act like buttons get the same variants. `tape` is the primary action. */
export function buttonClass(kind: ButtonKind = "plain", size: "sm" | "md" = "md") {
  return buttonVariants({ variant: VARIANT[kind], size: size === "sm" ? "default" : "lg", className: kind === "quiet" ? "px-0" : undefined });
}

export function Button({
  kind = "plain",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; size?: "sm" | "md" }) {
  return (
    <UiButton
      type="button"
      {...rest}
      variant={VARIANT[kind]}
      size={size === "sm" ? "default" : "lg"}
      className={cx(kind === "quiet" && "px-0", size === "md" && "px-3.5", className)}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export type MarkKind = "present" | "absent" | "late" | "disputed" | "verified" | "upcoming" | "missing";

const MARK_LABEL: Record<MarkKind, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  disputed: "Disputed",
  verified: "Verified",
  upcoming: "Not started",
  missing: "Missing OUT",
};

/** Status is a shape in a fixed cell (filled, hollow, half, struck or ticked), never colour alone. */
export function Mark({ kind, label = true, className }: { kind: MarkKind; label?: boolean; className?: string }) {
  const ink = kind === "disputed" ? "var(--destructive)" : kind === "absent" ? "var(--muted-foreground)" : "var(--primary)";
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
        <rect
          x="0.75"
          y="0.75"
          width="10.5"
          height="10.5"
          rx="3"
          fill={kind === "present" || kind === "verified" ? ink : "none"}
          stroke={ink}
          strokeWidth="1.5"
          strokeDasharray={kind === "upcoming" ? "2 2" : undefined}
        />
        {kind === "late" && <path d="M1.5 10.5 L10.5 1.5 L10.5 8 Q10.5 10.5 8 10.5 Z" fill={ink} />}
        {kind === "missing" && <path d="M3.75 0.75 H6 V11.25 H3.75 Q0.75 11.25 0.75 8.25 V3.75 Q0.75 0.75 3.75 0.75 Z" fill={ink} />}
        {kind === "disputed" && <path d="M2.5 9.5 L9.5 2.5" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />}
        {kind === "verified" && <path d="M3.4 6.2 L5.2 8 L8.8 4.2" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {label && <span>{MARK_LABEL[kind]}</span>}
    </span>
  );
}

type TagTone = "alert" | "ok" | "ink" | "day" | "night" | "muted";

const TONE: Record<TagTone, string> = {
  alert: "bg-destructive/10 text-destructive",
  ok: "bg-success/12 text-success",
  ink: "border-border text-foreground",
  day: "bg-accent text-accent-foreground",
  night: "bg-primary text-primary-foreground",
  muted: "bg-secondary text-muted-foreground",
};

/** A short status word. */
export function Tag({ tone = "muted", children, className }: { tone?: TagTone; children: ReactNode; className?: string }) {
  return (
    <Badge variant={tone === "ink" ? "outline" : "secondary"} className={cx(TONE[tone], className)}>
      {children}
    </Badge>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-6">
      <div className="min-w-0 max-w-[72ch]">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="mt-1 text-[14px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-xl border bg-card shadow-xs", className)}>{children}</section>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <EmptyFrame className="rounded-xl border border-dashed">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {children && <EmptyDescription>{children}</EmptyDescription>}
      </EmptyHeader>
    </EmptyFrame>
  );
}

export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground" role="note">
      <Lock className="size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="font-medium text-foreground">Read-only.</span> {children}
      </span>
    </p>
  );
}

/** Right-hand side sheet (shadcn Sheet on Radix Dialog: focus trap, Esc and overlay included). */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  // Sheets open from state or a URL hash, not a Radix trigger, so remember the opener ourselves.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <UiSheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        // The data-[side=right] prefix matches SheetContent's own width classes, so these win.
        tabIndex={-1}
        className={cx("gap-0 p-0 outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]", wide && "data-[side=right]:sm:max-w-[720px]")}
        onOpenAutoFocus={(e) => {
          // Start on the panel, not on its first button (which may be Approve or Reject).
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (opener.current?.isConnected) opener.current.focus();
          opener.current = null;
        }}
      >
        <SheetHeader className="border-b px-6 py-4 pr-12">
          <SheetTitle className="text-lg font-semibold tracking-tight">{title}</SheetTitle>
          <SheetDescription className={description ? undefined : "sr-only"}>{description ?? "Details"}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <SheetFooter className="flex-row flex-wrap items-center justify-end gap-2 border-t px-6 py-3">{footer}</SheetFooter>}
      </SheetContent>
    </UiSheet>
  );
}

/** A small confirm step for a consequential change. Focus returns to the button that opened it. */
export function ConfirmDialog({
  open,
  title,
  action,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  action: string;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onOpenAutoFocus={() => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (opener.current?.isConnected) opener.current.focus();
          opener.current = null;
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-[14px]">{children}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button kind="danger" onClick={onConfirm}>
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A shift is a fixed-capacity bar. Regular time fills the frame; extension overflows past its right edge,
 * so a 3h 15m extension never looks like a second 12-hour shift.
 */
export function ShiftBar({
  sched,
  actual,
  planned,
  now,
  compact,
}: {
  sched: { from: string; to: string };
  actual: { from: string | null; to: string | null };
  planned?: { from: string; to: string } | null;
  now: string;
  compact?: boolean;
}) {
  const s = toMin(sched.from);
  const e = toMin(sched.to);
  const len = e - s;
  const endCandidates = [e, actual.to ? toMin(actual.to) : 0, planned ? toMin(planned.to) : 0];
  const span = Math.max(...endCandidates) - Math.min(s, actual.from ? toMin(actual.from) : s);
  const origin = Math.min(s, actual.from ? toMin(actual.from) : s);
  const pct = (m: number) => `${((m - origin) / span) * 100}%`;
  const width = (a: number, b: number) => `${(Math.max(0, b - a) / span) * 100}%`;
  const aFrom = actual.from ? toMin(actual.from) : null;
  const aTo = actual.to ? toMin(actual.to) : actual.from ? Math.min(toMin(now), Math.max(...endCandidates)) : null;
  const ext = aFrom !== null && aTo !== null && aTo > e ? aTo - e : 0;
  return (
    <div className={cx("w-full", compact ? "" : "pt-1")}>
      <div
        className="relative h-2.5 overflow-hidden rounded-full bg-muted ring-1 ring-border ring-inset"
        role="img"
        aria-label={`Scheduled ${fmtDur(len)}${ext ? `, extension ${fmtDur(ext)}` : ""}`}
      >
        <div className="absolute inset-y-0 bg-accent" style={{ left: pct(s), width: width(s, e) }} />
        {planned && (
          <div
            className="absolute inset-y-0 border border-dashed border-destructive/70 bg-destructive/5"
            style={{ left: pct(toMin(planned.from)), width: width(toMin(planned.from), toMin(planned.to)) }}
            title="Planned extra duty"
          />
        )}
        {aFrom !== null && aTo !== null && (
          <>
            <div className="absolute inset-y-0 bg-primary" style={{ left: pct(aFrom), width: width(aFrom, Math.min(aTo, e)) }} />
            {aTo > e && <div className="absolute inset-y-0 bg-destructive" style={{ left: pct(e), width: width(e, aTo) }} />}
          </>
        )}
      </div>
      {!compact && (
        <div className="mt-1.5 flex justify-between text-[12px] text-muted-foreground">
          <span>Shift {fmtDur(len)}</span>
          {ext > 0 && <span className="font-medium text-destructive">+{fmtDur(ext)} extension</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- Toasts (sonner) ---------- */

const notify = (text: string, tone: "ok" | "alert" = "ok") => (tone === "alert" ? toast.error(text) : toast.success(text));
/** Stable function, so it is safe in effect dependencies. */
export const useToast = () => notify;

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="bottom-right" closeButton />
    </>
  );
}
