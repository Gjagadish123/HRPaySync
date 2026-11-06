"use client";

import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { isPresent, type Session } from "@/lib/attendance";
import { fmtDT, fmtDur, fromMin, toMin } from "@/lib/time";
import type { Verification } from "@/lib/types";
import { deploymentOf } from "@/lib/world";
import { useStore } from "./store";
import { Button, Field, Mark, ShiftBar, Tag, type MarkKind } from "./app-ui";

export function markFor(s: Session): MarkKind {
  switch (s.status) {
    case "ABSENT":
      return "absent";
    case "UPCOMING":
      return "upcoming";
    case "MISSING_OUT":
      return "missing";
    default:
      return s.lateMins ? "late" : "present";
  }
}

export const STATUS_TEXT: Record<Session["status"], string> = {
  UPCOMING: "Not started",
  ABSENT: "Absent",
  ON_DUTY: "On duty",
  PRESENT: "Completed",
  MISSING_OUT: "Missing OUT",
};

export function VerificationMark({ v }: { v?: Verification }) {
  if (!v || !v.client) return <span className="text-muted-foreground">Pending</span>;
  if (v.client === "DISPUTED") return v.resolved ? <span>Dispute resolved</span> : <Mark kind="disputed" />;
  return <Mark kind="verified" />;
}

/** One labelled value in a bordered fact grid. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function ManualPunchForm({ session, onDone, onCancel }: { session: Session; onDone: (msg: string) => void; onCancel: () => void }) {
  const { world, dispatch, viewer } = useStore();
  const max = world.now;
  const [at, setAt] = useState(session.in ? session.sched.to : session.sched.from);
  const [reason, setReason] = useState("");
  const [approver, setApprover] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const winLo = toMin(session.sched.from) - 180;
  const winHi = toMin(session.sched.to) + 14 * 60;
  const lo = fromMin(winLo);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!at) errs.at = "Enter the date and time of the missed punch.";
    else if (at > max) errs.at = "A punch can't be in the future.";
    else if (toMin(at) < winLo || toMin(at) > winHi) errs.at = `Must fall within this shift's window (${fmtDT(session.sched.from)} −3h to end +14h).`;
    if (reason.trim().length < 5) errs.reason = "Give a reason of at least 5 characters (e.g. 'Device FD-1 offline').";
    if (approver.trim().length < 2) errs.approver = "Name the approving person.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = dispatch(
      {
        type: "punch/manual",
        punch: {
          eventId: `MAN-${crypto.randomUUID().slice(0, 8)}`,
          source: "MANUAL",
          workerId: session.assignment.workerId,
          at,
          manual: { reason: reason.trim(), approver: approver.trim(), enteredBy: viewer.name },
        },
      },
      `Manual punch ${fmtDT(at)} for ${session.assignment.workerId}: ${reason.trim()}`,
    );
    if (r.ok) onDone("Manual punch added. The original device events are unchanged.");
    else setErrors({ form: r.error });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-xl border bg-muted/40 p-4">
      <p className="text-[13px] text-muted-foreground">
        Adds a new punch marked as manual. Raw device events are never edited or deleted.
      </p>
      <Field label="Punch date and time" error={errors.at}>
        {(p) => (
          <input {...p} type="datetime-local" className="field" value={at} min={lo} max={max} onChange={(e) => setAt(e.target.value)} />
        )}
      </Field>
      <Field label="Reason" error={errors.reason}>
        {(p) => <input {...p} className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Face device FD-1 offline 19:50–20:30" />}
      </Field>
      <Field label="Approved by" error={errors.approver}>
        {(p) => <input {...p} className="field" value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Name of approver" />}
      </Field>
      {errors.form && <p role="alert" className="text-[13px] font-medium text-destructive">{errors.form}</p>}
      <div className="flex items-center justify-end gap-4">
        <Button size="sm" kind="quiet" onClick={onCancel}>Cancel</Button>
        <Button kind="tape" type="submit">Add manual punch</Button>
      </div>
    </form>
  );
}

function NoteAction({
  label,
  placeholder,
  danger,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  danger?: boolean;
  onSubmit: (note: string) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <Button kind={danger ? "danger" : "plain"} size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  return (
    <form
      className="flex w-full flex-col gap-3 rounded-xl border bg-muted/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim().length < 5) return setErr("Write at least 5 characters so the other party knows what to fix.");
        const res = onSubmit(note.trim());
        if (res) setErr(res);
        else {
          setOpen(false);
          setNote("");
        }
      }}
    >
      <Field label={label} error={err}>
        {(p) => <textarea {...p} className="field min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />}
      </Field>
      <div className="flex items-center justify-end gap-4">
        <Button size="sm" kind="quiet" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" kind={danger ? "danger" : "tape"} type="submit">{label}</Button>
      </div>
    </form>
  );
}

export function SessionDetail({ session, onMessage }: { session: Session; onMessage: (m: string, tone?: "ok" | "alert") => void }) {
  const { world, n, can, dispatch } = useStore();
  const [correcting, setCorrecting] = useState(false);
  const w = n.worker.get(session.assignment.workerId)!;
  const dep = deploymentOf(world, w, session.assignment.date);
  const v = world.verifications[session.assignment.id];
  const extra = world.extraDuties.filter((x) => x.originalAssignmentId === session.assignment.id || x.extraAssignmentId === session.assignment.id);
  const raw = world.punches.filter((p) => session.punches.some((r) => r.eventIds.includes(p.eventId)));
  const key = session.assignment.id;
  const result = (r: { ok: boolean; error?: string }, okMsg: string) => {
    if (r.ok) onMessage(okMsg);
    else onMessage(r.error ?? "Not allowed", "alert");
    return r.ok ? null : (r.error ?? "Not allowed");
  };

  return (
    <div className="flex flex-col gap-6 text-sm">
      <section className="flex flex-col gap-0.5">
        <p className="font-mono text-[12px] text-muted-foreground">{w.id} · {w.deviceId}</p>
        <p className="text-lg font-semibold tracking-tight">{w.name}</p>
        <p className="text-muted-foreground">
          {w.designation} · {dep ? n.deploymentLabel(dep) : "Unassigned"}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Mark kind={markFor(session)} label={false} />
          <span className="font-semibold">{STATUS_TEXT[session.status]}</span>
          {session.lateMins > 0 && <Tag tone="alert">Late {fmtDur(session.lateMins)}</Tag>}
          {session.earlyOutMins > 0 && <Tag tone="alert">Early out {fmtDur(session.earlyOutMins)}</Tag>}
          {session.assignment.extraDutyId && <Tag tone="ink">Extra shift</Tag>}
          {session.hasManual && <Tag tone="muted">Manual punch</Tag>}
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
          <Fact label="Scheduled">{fmtDT(session.sched.from)} → {fmtDT(session.sched.to)}</Fact>
          <Fact label="Actual">
            {fmtDT(session.in)} → {session.out ? fmtDT(session.out) : session.status === "ON_DUTY" ? <span className="text-primary">on duty</span> : "—"}
          </Fact>
          <Fact label="Net worked">
            {fmtDur(session.netMins)} <span className="font-normal text-muted-foreground">(breaks {fmtDur(session.breakMins)})</span>
          </Fact>
          <Fact label="Regular / extension">
            {fmtDur(session.regularMins)} / <span className={session.extensionMins ? "text-destructive" : ""}>{fmtDur(session.extensionMins)}</span>
          </Fact>
        </dl>
        {isPresent(session) && <ShiftBar sched={session.sched} actual={{ from: session.in, to: session.out }} now={world.now} />}
        {extra.length > 0 && (
          <p>
            <span className="text-muted-foreground">Linked extra duty:</span>{" "}
            {extra.map((x) => `${x.kind === "EXTENSION" ? "Extension" : "Additional shift"} (${x.reason})`).join(", ")}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-semibold">Punches</h3>
          <p className="text-[13px] text-muted-foreground">Reconciled from raw device events.</p>
        </div>
        {session.punches.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-4 text-center text-muted-foreground">No punch received for this shift.</p>
        ) : (
          <ol className="divide-y overflow-hidden rounded-xl border">
            {session.punches.map((p, i) => (
              <li key={p.eventIds[0]} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <span className="font-mono text-[13px] tabular-nums">{fmtDT(p.at)}</span>
                <span className="text-[13px] text-muted-foreground">
                  {i === 0 ? "IN" : i === session.punches.length - 1 && session.out ? "OUT" : i % 2 === 1 ? "Break out" : "Break in"}
                </span>
                <span className="ml-auto flex gap-1">
                  {p.sources.map((s) => (
                    <Tag key={s} tone={s === "MANUAL" ? "day" : "muted"}>{s}</Tag>
                  ))}
                </span>
                {p.manual && (
                  <span className="w-full text-[12px] text-muted-foreground">
                    Manual: {p.manual.reason} · approved by {p.manual.approver}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        {session.duplicatesDropped > 0 && (
          <p className="text-[13px] text-muted-foreground">
            {session.duplicatesDropped} duplicate device event{session.duplicatesDropped > 1 ? "s" : ""} merged ({raw.length} raw events kept).
          </p>
        )}
        {can("manualPunch") && session.status !== "UPCOMING" && (
          correcting ? (
            <ManualPunchForm
              session={session}
              onCancel={() => setCorrecting(false)}
              onDone={(m) => {
                setCorrecting(false);
                onMessage(m);
              }}
            />
          ) : (
            <Button className="self-start" size="sm" onClick={() => setCorrecting(true)}>
              <Plus aria-hidden />
              Add missed punch
            </Button>
          )
        )}
      </section>

      {session.status !== "UPCOMING" && (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Verification</h3>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
            <Fact label="Client">
              <VerificationMark v={v} />
            </Fact>
            <Fact label="Contractor">
              {v?.contractor === "CONFIRMED" ? "Confirmed" : v?.contractor === "CORRECTION_REQUESTED" ? "Correction requested" : <span className="text-muted-foreground">Pending</span>}
            </Fact>
          </dl>
          {v?.notes.length ? (
            <ul className="flex flex-col gap-2.5 border-l-2 pl-3">
              {v.notes.map((x, i) => (
                <li key={i}>
                  <span className="block text-[12px] text-muted-foreground">{fmtDT(x.at)} · {x.by}</span>
                  {x.text}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {can("verifyClient") && v?.client !== "VERIFIED" && (
              <Button size="sm" kind="tape" onClick={() => result(dispatch({ type: "verify/client", keys: [key], value: "VERIFIED" }, `Verified ${w.id} on ${session.assignment.date}`), "Attendance verified.")}>
                Verify presence
              </Button>
            )}
            {can("verifyClient") && v?.client !== "DISPUTED" && (
              <NoteAction label="Dispute" danger placeholder="What doesn't match? e.g. not at station after 16:00" onSubmit={(note) => result(dispatch({ type: "verify/client", keys: [key], value: "DISPUTED", note }, `Disputed ${w.id} on ${session.assignment.date}`), "Dispute raised. Both sides' notes are kept.")} />
            )}
            {can("confirmContractor") && v?.contractor !== "CONFIRMED" && (
              <Button size="sm" kind="tape" onClick={() => result(dispatch({ type: "verify/contractor", keys: [key], value: "CONFIRMED" }, `Contractor confirmed ${w.id} on ${session.assignment.date}`), "Confirmed for the contractor.")}>
                Confirm
              </Button>
            )}
            {can("confirmContractor") && (
              <NoteAction label="Request correction" placeholder="Explain the correction, e.g. worker moved to stores dock" onSubmit={(note) => result(dispatch({ type: "verify/contractor", keys: [key], value: "CORRECTION_REQUESTED", note }, `Correction requested for ${w.id} on ${session.assignment.date}`), "Correction request sent to the client.")} />
            )}
            {can("resolveDispute") && v?.client === "DISPUTED" && !v.resolved && (
              <NoteAction label="Resolve dispute" placeholder="Outcome, e.g. accepted: worker was on stores dock" onSubmit={(note) => result(dispatch({ type: "verify/resolve", key, note }, `Resolved dispute ${w.id} on ${session.assignment.date}`), "Dispute resolved.")} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
