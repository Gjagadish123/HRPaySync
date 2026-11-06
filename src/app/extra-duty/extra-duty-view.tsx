"use client";

import { ChevronRight, Plus, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { SegmentedControl, Timeline } from "@/components/21st";
import { ComplianceList } from "@/components/compliance-list";
import { useStore } from "@/components/store";
import { Button, Empty, Field, PageHeader, Panel, ReadOnlyNote, Sheet, ShiftBar, Tag, cx, useToast } from "@/components/app-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { useHashId } from "@/components/use-hash";
import { evaluate, isBlocked } from "@/lib/compliance";
import { addDays, fmtDT, fmtDate, fmtDur, shiftWindow, toMin } from "@/lib/time";
import { EXTRA_REASONS, type ExtraDuty, type ExtraReason, type ExtraStatus } from "@/lib/types";
import { canSeeWorker, deploymentOf } from "@/lib/world";
import { COMMAND_STATUS, extraCommands, extraView, type ExtraCommand } from "@/lib/workflow";

const STATUS_TONE: Partial<Record<ExtraStatus, "alert" | "ok" | "ink" | "muted" | "day">> = {
  PENDING_APPROVAL: "day",
  REQUESTED: "day",
  APPROVED: "ink",
  IN_PROGRESS: "ink",
  COMPLETED: "ok",
  CLOSED: "muted",
  REJECTED: "muted",
  UNDER_REVIEW: "alert",
  DRAFT: "muted",
};
const label = (s: string) => s.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const COMMAND_LABEL: Record<ExtraCommand, string> = {
  submit: "Submit request",
  forward: "Send for approval",
  approve: "Approve",
  reject: "Reject",
  close: "Close after review",
};

const COMMAND_DONE: Record<ExtraCommand, string> = {
  submit: "Extra duty request submitted.",
  forward: "Sent for approval.",
  approve: "Extra duty approved.",
  reject: "Extra duty rejected.",
  close: "Extra duty closed.",
};

const SECTION_TITLE = "mb-3 text-base font-semibold";
const BOX = "rounded-lg border bg-muted/40 p-4";

/** Key for the ShiftBar fills, so the bar never relies on colour alone. */
function BarLegend() {
  const items = [
    ["Regular shift", "bg-accent ring-1 ring-border ring-inset"],
    ["Planned", "border border-dashed border-destructive/70 bg-destructive/5"],
    ["Worked", "bg-primary"],
    ["Beyond the shift", "bg-destructive"],
  ] as const;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground" aria-label="Bar key">
      {items.map(([text, swatch]) => (
        <li key={text} className="flex items-center gap-1.5">
          <span className={cx("h-2 w-3.5 rounded-sm", swatch)} aria-hidden />
          {text}
        </li>
      ))}
    </ul>
  );
}

function NewExtraDuty({ onDone }: { onDone: (id: string) => void }) {
  const { world, n, viewer, dispatch } = useStore();
  const toast = useToast();
  const consentId = useId();
  const workers = useMemo(
    () => world.workers.filter((w) => w.active && canSeeWorker(viewer, w, world.today)),
    [world.workers, world.today, viewer],
  );
  const [workerId, setWorkerId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [kind, setKind] = useState<ExtraDuty["kind"]>("EXTENSION");
  const [extEnd, setExtEnd] = useState("");
  const [addDate, setAddDate] = useState("");
  const activeShifts = world.shifts.filter((s) => s.active !== false);
  const [addShift, setAddShift] = useState(activeShifts[0]?.id ?? "");
  const [reason, setReason] = useState<ExtraReason>("Replacement absent");
  const [supervisor, setSupervisor] = useState("");
  const [remarks, setRemarks] = useState("");
  const [consent, setConsent] = useState(false);
  const [replacementId, setReplacementId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const options = useMemo(() => {
    const lo = addDays(world.today, -2);
    const hi = addDays(world.today, 6);
    return world.assignments
      .filter((a) => a.workerId === workerId && a.date >= lo && a.date <= hi)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [world.assignments, world.today, workerId]);
  const original = options.find((a) => a.id === assignmentId);
  const origShift = original && n.shift.get(original.shiftId);
  const origWin = original && origShift ? shiftWindow(original.date, origShift.start, origShift.end) : null;

  const planned = useMemo(() => {
    if (!origWin) return null;
    if (kind === "EXTENSION") return extEnd ? { start: origWin.end, end: extEnd } : null;
    const s = n.shift.get(addShift);
    if (!addDate || !s) return null;
    const w = shiftWindow(addDate, s.start, s.end);
    return { start: w.start, end: w.end };
  }, [origWin, kind, extEnd, addDate, addShift, n.shift]);

  const checks = useMemo(
    () =>
      planned && workerId
        ? evaluate(world, workerId, {
            start: planned.start,
            end: planned.end,
            extendsAssignmentId: kind === "EXTENSION" ? assignmentId : undefined,
          })
        : null,
    [planned, workerId, world, kind, assignmentId],
  );

  const replacements = world.replacements.filter((r) => r.outgoingAssignmentId === assignmentId);

  function submit(status: ExtraStatus) {
    const errs: Record<string, string> = {};
    if (!workerId) errs.worker = "Choose the worker.";
    if (!original) errs.assignment = "Choose the regular shift this extra duty is linked to.";
    if (kind === "EXTENSION") {
      if (!extEnd) errs.extEnd = "Enter when the extension is planned to end.";
      else if (origWin && toMin(extEnd) <= toMin(origWin.end)) errs.extEnd = `Must be after the shift ends (${fmtDT(origWin.end)}).`;
      else if (origWin && toMin(extEnd) - toMin(origWin.end) > 16 * 60) errs.extEnd = "An extension longer than 16 hours isn't plausible; check the date.";
    } else {
      if (!addDate) errs.addDate = "Choose the date of the additional shift.";
      else if (original && addDate <= original.date) errs.addDate = "An additional shift must be on a later date than the original shift.";
      if (!activeShifts.some((s) => s.id === addShift)) errs.addShift = "Choose an active shift.";
    }
    if (supervisor.trim().length < 2) errs.supervisor = "Name the supervisor responsible.";
    if (!consent) errs.consent = "Record the worker's agreement before submitting.";
    if (checks && isBlocked(checks)) errs.form = "A blocking rule fails. Change the timing or the roster first.";
    setErrors(errs);
    if (Object.keys(errs).length || !planned || !original) return;

    const id = `xd-${crypto.randomUUID().slice(0, 8)}`;
    const extraAssignment =
      kind === "ADDITIONAL_SHIFT"
        ? { id: `as-x-${workerId}-${addDate}-${id}`, workerId, date: addDate, shiftId: addShift, extraDutyId: id }
        : undefined;
    const extra: ExtraDuty = {
      id,
      workerId,
      kind,
      originalAssignmentId: original.id,
      extraAssignmentId: extraAssignment?.id,
      plannedStart: planned.start,
      plannedEnd: planned.end,
      reason,
      supervisor: supervisor.trim(),
      remarks: remarks.trim(),
      consent,
      replacementId: replacementId || undefined,
      status,
      history: [{ at: world.now, by: viewer.name, status, note: "Created" }],
    };
    const res = dispatch(
      { type: "extra/create", extra, extraAssignment },
      `${kind === "EXTENSION" ? "Extension" : "Additional shift"} for ${workerId} ${fmtDT(planned.start)}–${fmtDT(planned.end)} (${reason})`,
    );
    if (!res.ok) return setErrors({ form: res.error });
    toast(status === "DRAFT" ? "Draft saved." : "Extra duty submitted.");
    onDone(id);
  }

  const byDeployment = useMemo(() => {
    const groups = new Map<string, typeof workers>();
    for (const w of workers) {
      const d = deploymentOf(world, w, world.today);
      const key = d ? n.deploymentLabel(d) : "Unassigned";
      groups.set(key, [...(groups.get(key) ?? []), w]);
    }
    return [...groups];
  }, [workers, world, n]);

  return (
    <form className="flex flex-col gap-6" noValidate onSubmit={(e) => { e.preventDefault(); submit(viewer.role === "CONTRACTOR_ADMIN" ? "REQUESTED" : "PENDING_APPROVAL"); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Worker" error={errors.worker}>
          {(p) => (
            <select {...p} className="field" value={workerId} onChange={(e) => { setWorkerId(e.target.value); setAssignmentId(""); }}>
              <option value="">Choose a worker…</option>
              {byDeployment.map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list.map((w) => (
                    <option key={w.id} value={w.id}>{w.id} · {w.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </Field>
        <Field label="Linked regular shift" error={errors.assignment} hint={workerId && options.length === 0 ? "This worker has no shift rostered in the last 2 or next 6 days." : undefined}>
          {(p) => (
            <select {...p} className="field" value={assignmentId} disabled={!workerId} onChange={(e) => setAssignmentId(e.target.value)}>
              <option value="">Choose the shift…</option>
              {options.map((a) => {
                const s = n.shift.get(a.shiftId)!;
                return (
                  <option key={a.id} value={a.id}>
                    {fmtDate(a.date)} · {s.code} {s.start}–{s.end}
                  </option>
                );
              })}
            </select>
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1.5">Type of extra duty</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["EXTENSION", "Continue straight after this shift", "For a replacement who is absent or late. Can run past midnight."],
              ["ADDITIONAL_SHIFT", "Additional shift on a later date", "A separate shift, checked against rest rules."],
            ] as const
          ).map(([value, title, sub]) => (
            <label
              key={value}
              className={cx(
                "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ease-out has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                kind === value ? "border-primary bg-accent/60" : "hover:bg-muted/50",
              )}
            >
              <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-0.5 size-4 shrink-0 accent-primary" />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">{sub}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "EXTENSION" ? (
        <Field label="Planned to end at" error={errors.extEnd} hint={origWin ? `Shift ends ${fmtDT(origWin.end)}. Only the time actually worked is counted.` : "Choose the shift first."}>
          {(p) => <input {...p} type="datetime-local" className="field sm:max-w-xs" value={extEnd} disabled={!origWin} min={origWin?.end} onChange={(e) => setExtEnd(e.target.value)} />}
        </Field>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" error={errors.addDate}>
            {(p) => <input {...p} type="date" className="field" value={addDate} min={original ? addDays(original.date, 1) : undefined} disabled={!original} onChange={(e) => setAddDate(e.target.value)} />}
          </Field>
          <Field
            label="Shift"
            error={activeShifts.length ? errors.addShift : "No shift is active. Activate one in Shifts before planning an additional shift."}
          >
            {(p) => (
              <select {...p} className="field" value={addShift} disabled={!activeShifts.length} onChange={(e) => setAddShift(e.target.value)}>
                {activeShifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} · {s.start}–{s.end}</option>
                ))}
              </select>
            )}
          </Field>
        </div>
      )}

      {origWin && planned && (
        <div className={cx(BOX, "flex flex-col gap-2")}>
          <p className="flex items-baseline justify-between gap-3">
            <span className="font-medium">Plan</span>
            <span className="text-[13px] text-muted-foreground">
              {fmtDT(planned.start)} → {fmtDT(planned.end)} · <span className="font-medium text-foreground">{fmtDur(toMin(planned.end) - toMin(planned.start))}</span>
            </span>
          </p>
          <ShiftBar sched={{ from: origWin.start, to: origWin.end }} actual={{ from: null, to: null }} planned={{ from: planned.start, to: planned.end }} now={world.now} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reason">
          {(p) => (
            <select {...p} className="field" value={reason} onChange={(e) => setReason(e.target.value as ExtraReason)}>
              {EXTRA_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Supervisor" error={errors.supervisor}>
          {(p) => <input {...p} className="field" value={supervisor} onChange={(e) => setSupervisor(e.target.value)} placeholder="Supervisor · Loading" />}
        </Field>
      </div>
      {replacements.length > 0 && (
        <Field label="Linked replacement">
          {(p) => (
            <select {...p} className="field" value={replacementId} onChange={(e) => setReplacementId(e.target.value)}>
              <option value="">None</option>
              {replacements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.replacementWorkerId ? `${r.replacementWorkerId} · ` : "Unassigned · "}due {fmtDT(r.plannedReportAt)} · {label(r.status)}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <Field label="Remarks">
        {(p) => <textarea {...p} className="field min-h-20" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="What needs covering, and why" />}
      </Field>
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={consentId}
          checked={consent}
          onCheckedChange={(c) => setConsent(c === true)}
          className="mt-0.5"
          aria-invalid={errors.consent ? true : undefined}
          aria-describedby={errors.consent ? `${consentId}-err` : undefined}
        />
        <div>
          <label htmlFor={consentId} className="cursor-pointer">Worker has agreed to the extra duty</label>
          {errors.consent && <p id={`${consentId}-err`} className="text-[13px] font-medium text-destructive">{errors.consent}</p>}
        </div>
      </div>

      {checks && (
        <div className={BOX}>
          <p className="mb-2.5 font-medium">Checks against configured policy</p>
          <ComplianceList results={checks} />
        </div>
      )}
      {errors.form && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>{errors.form}</AlertTitle>
        </Alert>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button onClick={() => submit("DRAFT")}>Save draft</Button>
        <Button kind="tape" type="submit" disabled={!!checks && isBlocked(checks)}>
          {viewer.role === "CONTRACTOR_ADMIN" ? "Send request" : "Submit for approval"}
        </Button>
      </div>
    </form>
  );
}

function Detail({ x }: { x: ExtraDuty }) {
  const { world, idx, n, can, dispatch } = useStore();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const v = extraView(world, idx, x);
  const original = idx.byAssignment.get(x.kind === "ADDITIONAL_SHIFT" && x.extraAssignmentId ? x.extraAssignmentId : x.originalAssignmentId);
  const w = n.worker.get(x.workerId);
  const cmds = extraCommands(v, x.status);
  const checks = evaluate(world, x.workerId, {
    start: x.plannedStart,
    end: x.plannedEnd,
    extendsAssignmentId: x.kind === "EXTENSION" ? x.originalAssignmentId : undefined,
    ignoreAssignmentIds: x.extraAssignmentId ? [x.extraAssignmentId] : [],
  });
  const allowed = (c: ExtraCommand) =>
    c === "approve" || c === "reject" || c === "close" ? can("approveExtra") : c === "forward" ? can("forwardExtra") : can("createExtra");

  function run(c: ExtraCommand) {
    if ((c === "reject" || c === "close") && note.trim().length < 5) {
      setErr(c === "reject" ? "Give the reason for rejecting (at least 5 characters)." : "Add a review note (at least 5 characters).");
      return;
    }
    const status = COMMAND_STATUS[c];
    const res = dispatch({ type: "extra/status", id: x.id, status, note: note.trim() || undefined }, `${COMMAND_LABEL[c]}: extra duty ${x.id} for ${x.workerId}`);
    if (!res.ok) return toast(res.error, "alert");
    setNote("");
    setErr(null);
    toast(COMMAND_DONE[c]);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div>
          <p className="font-mono text-[12px] text-muted-foreground">{x.workerId}</p>
          <p className="text-lg font-semibold tracking-tight">{w?.name}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Tag tone={STATUS_TONE[v.status]}>{label(v.status)}</Tag>
          <Tag tone="muted">{x.kind === "EXTENSION" ? "Extension" : "Additional shift"}</Tag>
          {x.consent ? <Tag tone="muted">Consent recorded</Tag> : <Tag tone="alert">No consent</Tag>}
        </div>
        {v.review && (
          <Alert variant="destructive" role="status">
            <TriangleAlert aria-hidden />
            <AlertTitle>{v.review}</AlertTitle>
            <AlertDescription>The actual time stays on record.</AlertDescription>
          </Alert>
        )}
      </section>

      <section className="rounded-lg border">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4">
          <div>
            <dt className="text-[13px] text-muted-foreground">Planned</dt>
            <dd className="mt-0.5 font-medium">
              {fmtDT(x.plannedStart)} → {fmtDT(x.plannedEnd)}
              <span className="block text-[13px] font-normal text-muted-foreground">{fmtDur(v.plannedMins)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted-foreground">Actual</dt>
            <dd className="mt-0.5 font-medium">
              {v.actual.from ? `${fmtDT(v.actual.from)} → ${v.actual.running ? "running" : fmtDT(v.actual.to)}` : "No time worked yet"}
              <span className={cx("block text-[13px]", v.actual.mins ? "font-medium text-destructive" : "font-normal text-muted-foreground")}>{fmtDur(v.actual.mins)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted-foreground">Reason</dt>
            <dd className="mt-0.5 font-medium">{x.reason}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted-foreground">Supervisor</dt>
            <dd className="mt-0.5 font-medium">{x.supervisor}</dd>
          </div>
          {x.remarks && (
            <div className="col-span-2">
              <dt className="text-[13px] text-muted-foreground">Remarks</dt>
              <dd className="mt-0.5">{x.remarks}</dd>
            </div>
          )}
        </dl>
        {original && (
          <div className="flex flex-col gap-2 border-t px-4 py-3">
            <ShiftBar
              sched={original.sched}
              actual={{ from: original.in, to: original.out }}
              planned={{ from: x.plannedStart, to: x.plannedEnd }}
              now={world.now}
            />
            <BarLegend />
          </div>
        )}
      </section>

      <section>
        <h3 className={SECTION_TITLE}>Checks against configured policy</h3>
        <div className={BOX}>
          <ComplianceList results={checks} />
        </div>
      </section>

      <section>
        <h3 className={SECTION_TITLE}>History</h3>
        <Timeline events={x.history.map((h) => ({ at: h.at, title: label(h.status), by: h.by, note: h.note }))} />
      </section>

      {cmds.length > 0 && (
        <section className="flex flex-col gap-3 border-t pt-5">
          {cmds.some(allowed) ? (
            <>
              <Field label="Note" error={err} hint="Required when rejecting or closing.">
                {(p) => <textarea {...p} className="field min-h-16" value={note} onChange={(e) => setNote(e.target.value)} />}
              </Field>
              <div className="flex flex-wrap justify-end gap-2">
                {cmds.filter(allowed).map((c) => (
                  <Button key={c} kind={c === "reject" ? "danger" : c === "approve" || c === "close" ? "tape" : "plain"} onClick={() => run(c)}>
                    {COMMAND_LABEL[c]}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <ReadOnlyNote>Waiting for {cmds.includes("approve") ? "client approval" : "the next step"}; your role can&apos;t act on it.</ReadOnlyNote>
          )}
        </section>
      )}
    </div>
  );
}

export function ExtraDutyView() {
  const { world, idx, n, viewer, can } = useStore();
  const [openId, setOpenId] = useHashId();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const items = useMemo(
    () =>
      world.extraDuties
        .filter((x) => {
          const w = n.worker.get(x.workerId);
          return w && canSeeWorker(viewer, w, x.plannedStart.slice(0, 10));
        })
        .map((x) => ({ x, v: extraView(world, idx, x) }))
        .filter(({ v }) => filter === "all" || !["CLOSED", "REJECTED"].includes(v.status))
        .sort((a, b) => b.x.plannedStart.localeCompare(a.x.plannedStart)),
    [world, idx, n, viewer, filter],
  );
  // Same scope as the list, so a hash link cannot open another contractor's record.
  const open = world.extraDuties.find((x) => {
    const w = x.id === openId ? n.worker.get(x.workerId) : undefined;
    return !!w && canSeeWorker(viewer, w, x.plannedStart.slice(0, 10));
  });

  return (
    <div>
      <PageHeader
        title="Extra duty"
        description="Extensions after a shift and additional shifts on later dates. The plan and the actual time are kept apart: a late reliever means only the real extension counts."
        actions={
          can("createExtra") && (
            <Button kind="tape" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden /> New extra duty
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          size="sm"
          label="Show extra duty"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: "open", label: "Open" },
            { value: "all", label: "All, incl. closed" },
          ]}
        />
        <p className="text-[13px] text-muted-foreground">
          {items.length} {items.length === 1 ? "request" : "requests"}, newest first
        </p>
      </div>

      {items.length === 0 ? (
        <Empty title={filter === "open" ? "No open extra duty" : "No extra duty recorded"}>
          {can("createExtra") ? "Use New extra duty when a reliever is absent or late." : "Nothing to review for your role."}
        </Empty>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-border">
            {items.map(({ x, v }) => {
              const w = n.worker.get(x.workerId);
              const original = idx.byAssignment.get(x.kind === "ADDITIONAL_SHIFT" && x.extraAssignmentId ? x.extraAssignmentId : x.originalAssignmentId);
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(x.id)}
                    className="group grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-3 px-4 py-3.5 text-left transition-colors ease-out hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-center"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-[12px] text-muted-foreground">{x.workerId}</span>
                      <span className="block truncate font-medium">{w?.name}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">{x.reason}</span>
                    </span>
                    <span className="flex flex-wrap items-center justify-end gap-1.5 self-start md:order-last md:self-center">
                      <Tag tone={STATUS_TONE[v.status]}>{label(v.status)}</Tag>
                      {v.review && <Tag tone="alert">Review</Tag>}
                      <ChevronRight className="hidden size-4 text-muted-foreground transition-colors group-hover:text-foreground md:block" aria-hidden />
                    </span>
                    <span className="col-span-2 md:col-span-1">
                      <span className="block">{x.kind === "EXTENSION" ? "Extension" : "Additional shift"}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        Planned {fmtDur(v.plannedMins)} · Actual <span className={v.actual.mins ? "font-medium text-destructive" : ""}>{fmtDur(v.actual.mins)}</span>
                      </span>
                    </span>
                    <span className="col-span-2 min-w-0 md:col-span-1">
                      {original ? (
                        <ShiftBar
                          compact
                          sched={original.sched}
                          actual={{ from: original.in, to: original.out }}
                          planned={{ from: x.plannedStart, to: x.plannedEnd }}
                          now={world.now}
                        />
                      ) : null}
                      <span className="mt-1.5 block text-[12px] text-muted-foreground">{fmtDT(x.plannedStart)} → {fmtDT(x.plannedEnd)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="New extra duty" description="Link it to a regular shift; the checks update as you fill it in." wide>
        {creating && (
          <NewExtraDuty
            onDone={(id) => {
              setCreating(false);
              setOpenId(id);
            }}
          />
        )}
      </Sheet>
      <Sheet open={!!open && !creating} onClose={() => setOpenId(null)} title={open ? `Extra duty · ${open.workerId}` : ""} wide>
        {open && <Detail x={open} />}
      </Sheet>
    </div>
  );
}
