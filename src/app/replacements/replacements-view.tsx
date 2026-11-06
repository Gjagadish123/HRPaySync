"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Timeline } from "@/components/21st";
import { ComplianceList } from "@/components/compliance-list";
import { useStore } from "@/components/store";
import { Button, Empty, Field, PageHeader, Panel, ReadOnlyNote, Sheet, Tag, cx, useToast } from "@/components/app-ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHashId } from "@/components/use-hash";
import { evaluate, isBlocked } from "@/lib/compliance";
import { addDays, dateOf, fmtDT, fmtDate, shiftWindow, timeOf, toMin } from "@/lib/time";
import type { Replacement, ReplacementStatus, ShiftAssignment, World } from "@/lib/types";
import { canSeeWorker, deploymentOf, type Names } from "@/lib/world";
import { OPEN_REPLACEMENT, replacementView } from "@/lib/workflow";

const TONE: Record<ReplacementStatus, "alert" | "ok" | "ink" | "muted" | "day"> = {
  NOT_ASSIGNED: "alert",
  ASSIGNED: "day",
  CONFIRMED: "ink",
  REPORTED: "ok",
  LATE: "alert",
  ABSENT: "alert",
  CANCELLED: "muted",
  REPLACED: "muted",
};
const label = (s: string) => s.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const SECTION_TITLE = "mb-3 text-base font-semibold";
const BOX = "rounded-lg border bg-muted/40 p-4";
const LINK = "font-medium text-primary underline-offset-4 hover:underline";

/** Relievers from the same deployment who are free (or already rostered) for the shift that starts at handover. */
function candidates(world: World, n: Names, r: { outgoingWorkerId: string; plannedReportAt: string }) {
  const out = n.worker.get(r.outgoingWorkerId);
  const date = dateOf(r.plannedReportAt);
  const dep = out && deploymentOf(world, out, date);
  // Only an active shift can take a reliever; the store refuses an inactive one.
  const active = world.shifts.filter((s) => s.active !== false);
  const shift = active.find((s) => s.start === timeOf(r.plannedReportAt)) ?? active.find((s) => s.code === "N");
  if (!shift) return null;
  const win = shiftWindow(date, shift.start, shift.end);
  return world.workers
    .filter((w) => w.active && w.id !== r.outgoingWorkerId && dep && deploymentOf(world, w, date)?.id === dep.id)
    .map((w) => {
      const rostered = world.assignments.find((a) => a.workerId === w.id && a.date === date && a.shiftId === shift.id);
      const checks = evaluate(world, w.id, { start: win.start, end: win.end, ignoreAssignmentIds: rostered ? [rostered.id] : [] });
      return { w, rostered, checks, blocked: isBlocked(checks), shift, date };
    })
    .sort((a, b) => Number(a.blocked) - Number(b.blocked) || Number(!!b.rostered) - Number(!!a.rostered) || a.w.id.localeCompare(b.w.id));
}

function RelieverPicker({ r, onPick, submitLabel }: { r: { outgoingWorkerId: string; plannedReportAt: string }; onPick: (workerId: string, assignmentId: string, assignment?: ShiftAssignment) => string | null; submitLabel: string }) {
  const { world, n } = useStore();
  const list = useMemo(() => candidates(world, n, r), [world, n, r]);
  const [pick, setPick] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const chosen = list?.find((c) => c.w.id === pick);
  if (!list) return <ReadOnlyNote>No active shift starts at {timeOf(r.plannedReportAt)}, so a reliever can&apos;t be rostered. Activate the shift in Shifts first.</ReadOnlyNote>;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Reliever" error={err} hint="Same contractor and department. Workers who would break a blocking rule are listed last and can't be picked.">
        {(p) => (
          <select {...p} className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a reliever…</option>
            {list.map((c) => (
              <option key={c.w.id} value={c.w.id} disabled={c.blocked}>
                {c.w.id} · {c.w.name}
                {c.rostered ? " · rostered for this shift" : ""}
                {c.blocked ? " · not available" : c.checks.some((x) => !x.ok) ? " · warning" : ""}
              </option>
            ))}
          </select>
        )}
      </Field>
      {chosen && (
        <div className={BOX}>
          <p className="mb-2.5 font-medium">
            {chosen.shift.code} shift {fmtDate(chosen.date)} · checks
          </p>
          <ComplianceList results={chosen.checks} />
        </div>
      )}
      <div className="flex justify-end">
        <Button
          kind="tape"
          disabled={!chosen || chosen.blocked}
          onClick={() => {
            if (!chosen) return setErr("Choose a reliever.");
            const assignment = chosen.rostered
              ? undefined
              : { id: `as-r-${chosen.w.id}-${chosen.date}-${crypto.randomUUID().slice(0, 6)}`, workerId: chosen.w.id, date: chosen.date, shiftId: chosen.shift.id };
            const e = onPick(chosen.w.id, chosen.rostered?.id ?? assignment!.id, assignment);
            setErr(e);
          }}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function Person({ role, id, name }: { role: string; id?: string; name?: string }) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <p className="text-[12px] text-muted-foreground">{role}</p>
      {id ? (
        <>
          <p className="mt-1 font-mono text-[12px] text-muted-foreground">{id}</p>
          <p className="truncate font-medium">{name}</p>
        </>
      ) : (
        <p className="mt-1 font-medium text-destructive">Not assigned</p>
      )}
    </div>
  );
}

function Detail({ r, onReplaced }: { r: Replacement; onReplaced: (id: string) => void }) {
  const { world, idx, n, can, dispatch, viewer } = useStore();
  const toast = useToast();
  const v = replacementView(world, idx, r);
  const [note, setNote] = useState("");
  const [handover, setHandover] = useState(r.handoverAt ?? (v.arrival && v.arrival > r.plannedReportAt ? v.arrival : r.plannedReportAt));
  const [err, setErr] = useState<string | null>(null);
  const out = n.worker.get(r.outgoingWorkerId);
  const rel = r.replacementWorkerId ? n.worker.get(r.replacementWorkerId) : null;
  const extras = world.extraDuties.filter((x) => x.replacementId === r.id || x.originalAssignmentId === r.outgoingAssignmentId);
  const closed = r.status === "CANCELLED" || r.status === "REPLACED";

  const act = (status: ReplacementStatus, msg: string, opts: { needsNote?: boolean; handoverAt?: string } = {}) => {
    if (opts.needsNote && note.trim().length < 5) return setErr("Add a short note (at least 5 characters).");
    const res = dispatch({ type: "repl/status", id: r.id, status, note: note.trim() || undefined, handoverAt: opts.handoverAt }, `Replacement ${r.id}: ${label(status)}`);
    if (!res.ok) return toast(res.error, "alert");
    setNote("");
    setErr(null);
    toast(msg);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
          <Person role="Outgoing" id={out?.id} name={out?.name} />
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
          <Person role="Reliever" id={rel?.id} name={rel?.name} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Tag tone={TONE[v.status]}>{label(v.status)}</Tag>
          {v.overdue && r.replacementWorkerId && <Tag tone="alert">Not reported</Tag>}
        </div>
      </section>

      <section className="rounded-lg border">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-3">
          <div>
            <dt className="text-[13px] text-muted-foreground">Due</dt>
            <dd className="mt-0.5 font-medium">{fmtDT(r.plannedReportAt)}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted-foreground">First punch</dt>
            <dd className={cx("mt-0.5", v.arrival ? "font-medium" : "text-muted-foreground")}>{v.arrival ? fmtDT(v.arrival) : "No punch yet"}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted-foreground">Handover</dt>
            <dd className={cx("mt-0.5", r.handoverAt ? "font-medium" : "text-muted-foreground")}>{r.handoverAt ? fmtDT(r.handoverAt) : "Not recorded"}</dd>
          </div>
        </dl>
        <p className="border-t px-4 py-2.5 text-[13px] text-muted-foreground">Reported and late are set from the reliever&apos;s actual punch, never by hand.</p>
      </section>

      {extras.length > 0 ? (
        <p>
          Covered by extra duty:{" "}
          {extras.map((x, i) => (
            <span key={x.id}>
              {i > 0 && ", "}
              <Link href={`/extra-duty#${x.id}`} className={LINK}>
                {x.workerId} {x.kind === "EXTENSION" ? "extension" : "additional shift"}
              </Link>
            </span>
          ))}
        </p>
      ) : (
        !closed &&
        v.status !== "REPORTED" && (
          <p className="text-muted-foreground">
            If the outgoing worker stays on, record it on{" "}
            <Link href="/extra-duty" className={LINK}>Extra duty</Link> so only the actual extension is counted.
          </p>
        )
      )}

      {!closed && r.status === "NOT_ASSIGNED" && (
        can("manageReplacement") ? (
          <section>
            <h3 className={SECTION_TITLE}>Assign reliever</h3>
            <RelieverPicker
              r={r}
              submitLabel="Assign reliever"
              onPick={(workerId, assignmentId, assignment) => {
                const res = dispatch({ type: "repl/assign", id: r.id, workerId, assignmentId, assignment }, `Assigned reliever ${workerId} for ${r.outgoingWorkerId}`);
                if (!res.ok) {
                  toast(res.error, "alert");
                  return null;
                }
                toast("Reliever assigned. They count as present only after their punch.");
                return null;
              }}
            />
          </section>
        ) : (
          <ReadOnlyNote>Only client supervisors and contractors can assign relievers.</ReadOnlyNote>
        )
      )}

      {!closed && r.status !== "NOT_ASSIGNED" && (
        <section className="flex flex-col gap-4 border-t pt-5">
          <Field label="Note" error={err} hint="Required for absent, cancel and replace.">
            {(p) => <textarea {...p} className="field min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called at 20:10, phone switched off" />}
          </Field>
          <div className="flex flex-wrap gap-2">
            {r.status === "ASSIGNED" && !v.arrival && can("manageReplacement") && (
              <Button kind="tape" onClick={() => act("CONFIRMED", "Reliever confirmed.")}>Confirm reliever</Button>
            )}
            {(v.overdue || r.status === "LATE") && !v.arrival && can("markReplacement") && (
              <Button kind="danger" onClick={() => act("ABSENT", "Marked absent. The outgoing worker's actual time stays on record.", { needsNote: true })}>Mark absent</Button>
            )}
            {OPEN_REPLACEMENT.includes(r.status) && !v.arrival && can("manageReplacement") && (
              <Button onClick={() => act("CANCELLED", "Replacement cancelled.", { needsNote: true })}>Cancel</Button>
            )}
          </div>
          {v.arrival && can("markReplacement") && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Handover time (outgoing released)" className="min-w-[220px] flex-1">
                {(p) => <input {...p} type="datetime-local" className="field" value={handover} max={world.now} onChange={(e) => setHandover(e.target.value)} />}
              </Field>
              <Button
                onClick={() => {
                  if (!handover || handover > world.now) return setErr("Handover can't be empty or in the future.");
                  act(v.status, "Handover time recorded.", { handoverAt: handover });
                }}
              >
                Record handover
              </Button>
            </div>
          )}
          {(r.status === "ABSENT" || v.overdue) && can("manageReplacement") && (
            <div className="border-t pt-5">
              <h3 className={SECTION_TITLE}>Replace with another reliever</h3>
              <RelieverPicker
                r={r}
                submitLabel="Assign new reliever"
                onPick={(workerId, assignmentId, assignment) => {
                  if (note.trim().length < 5) return "Add a note explaining why the first reliever is replaced.";
                  const id = `rp-${crypto.randomUUID().slice(0, 8)}`;
                  const next: Replacement = {
                    ...r,
                    id,
                    replacementWorkerId: workerId,
                    replacementAssignmentId: assignmentId,
                    status: "ASSIGNED",
                    handoverAt: undefined,
                    replacedById: undefined,
                    history: [{ at: world.now, by: viewer.name, status: "ASSIGNED", note: `Replaces ${r.replacementWorkerId}` }],
                  };
                  // Create the new record first, so a refusal leaves the current one untouched.
                  const b = dispatch({ type: "repl/create", replacement: next, assignment }, `New reliever ${workerId} for ${r.outgoingWorkerId}`);
                  if (!b.ok) {
                    toast(b.error, "alert");
                    return null;
                  }
                  const a = dispatch({ type: "repl/status", id: r.id, status: "REPLACED", note: note.trim() }, `Replacement ${r.id} replaced`);
                  if (!a.ok) {
                    toast(a.error, "alert");
                    return null;
                  }
                  toast("New reliever assigned.");
                  onReplaced(id);
                  return null;
                }}
              />
            </div>
          )}
        </section>
      )}

      <section>
        <h3 className={SECTION_TITLE}>History</h3>
        <Timeline events={r.history.map((h) => ({ at: h.at, title: label(h.status), by: h.by, note: h.note }))} />
      </section>
    </div>
  );
}

function NewReplacement({ onDone }: { onDone: (id: string) => void }) {
  const { world, n, viewer, dispatch } = useStore();
  const toast = useToast();
  const [assignmentId, setAssignmentId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const shifts = useMemo(() => {
    const dates = new Set([world.today, addDays(world.today, 1)]);
    return world.assignments
      .filter((a) => dates.has(a.date) && !a.extraDutyId)
      .filter((a) => {
        const w = n.worker.get(a.workerId);
        return w && canSeeWorker(viewer, w, a.date) && !world.replacements.some((r) => r.outgoingAssignmentId === a.id && OPEN_REPLACEMENT.includes(r.status));
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.workerId.localeCompare(b.workerId));
  }, [world, n, viewer]);
  const a = shifts.find((x) => x.id === assignmentId);
  const s = a && n.shift.get(a.shiftId);
  const due = a && s ? shiftWindow(a.date, s.start, s.end).end : null;
  return (
    <div className="flex flex-col gap-5">
      <Field label="Outgoing worker's shift" error={err} hint="Today's and tomorrow's shifts without an open replacement.">
        {(p) => (
          <select {...p} className="field" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
            <option value="">Choose a shift…</option>
            {shifts.map((x) => {
              const sh = n.shift.get(x.shiftId)!;
              return (
                <option key={x.id} value={x.id}>
                  {fmtDate(x.date)} {sh.code} · {x.workerId} {n.worker.get(x.workerId)?.name}
                </option>
              );
            })}
          </select>
        )}
      </Field>
      {due && (
        <p className={cx(BOX, "flex items-baseline justify-between gap-3")}>
          <span className="text-muted-foreground">Reliever due at handover</span>
          <span className="font-medium">{fmtDT(due)}</span>
        </p>
      )}
      <div className="flex justify-end border-t pt-4">
        <Button
          kind="tape"
          onClick={() => {
            if (!a || !due) return setErr("Choose the outgoing worker's shift.");
            const id = `rp-${crypto.randomUUID().slice(0, 8)}`;
            const res = dispatch(
              {
                type: "repl/create",
                replacement: { id, outgoingWorkerId: a.workerId, outgoingAssignmentId: a.id, replacementWorkerId: null, replacementAssignmentId: null, plannedReportAt: due, status: "NOT_ASSIGNED", history: [] },
              },
              `Replacement needed for ${a.workerId} at ${fmtDT(due)}`,
            );
            if (!res.ok) return setErr(res.error);
            toast("Replacement created. Assign a reliever next.");
            onDone(id);
          }}
        >
          Create replacement
        </Button>
      </div>
    </div>
  );
}

export function ReplacementsView() {
  const { world, idx, n, viewer, can } = useStore();
  const [openId, setOpenId] = useHashId();
  const [creating, setCreating] = useState(false);
  const rows = useMemo(
    () =>
      world.replacements
        .filter((r) => {
          const w = n.worker.get(r.outgoingWorkerId);
          return w && canSeeWorker(viewer, w, dateOf(r.plannedReportAt));
        })
        .map((r) => ({ r, v: replacementView(world, idx, r) }))
        .sort((a, b) => b.r.plannedReportAt.localeCompare(a.r.plannedReportAt)),
    [world, idx, n, viewer],
  );
  // Same scope as the list, so a hash link cannot open another contractor's record.
  const open = world.replacements.find((r) => {
    const w = r.id === openId ? n.worker.get(r.outgoingWorkerId) : undefined;
    return !!w && canSeeWorker(viewer, w, dateOf(r.plannedReportAt));
  });
  const nowM = toMin(world.now);

  return (
    <div>
      <PageHeader
        title="Replacements"
        description="Who relieves whom at each handover. A reliever counts as present only after a real punch is received."
        actions={
          can("manageReplacement") && (
            <Button kind="tape" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden /> New replacement
            </Button>
          )
        }
      />
      {rows.length === 0 ? (
        <Empty title="No replacements recorded">Create one when a worker&apos;s shift needs a reliever.</Empty>
      ) : (
        <Panel className="overflow-hidden">
          <Table className="text-[14px]">
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 text-[13px] text-muted-foreground">Due</TableHead>
                <TableHead className="px-4 text-[13px] text-muted-foreground">Outgoing</TableHead>
                <TableHead className="px-4 text-[13px] text-muted-foreground">Reliever</TableHead>
                <TableHead className="px-4 text-[13px] text-muted-foreground">Status</TableHead>
                <TableHead className="px-4 text-[13px] text-muted-foreground">First punch</TableHead>
                <TableHead className="px-4 text-[13px] text-muted-foreground">Handover</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ r, v }) => {
                const upcoming = toMin(r.plannedReportAt) > nowM;
                return (
                  // ponytail: the buttons are the keyboard path; their clicks bubble to the row's handler.
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <TableCell className="px-4 py-3">
                      <button type="button" className="rounded-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2">
                        {fmtDT(r.plannedReportAt)}
                      </button>
                      {upcoming && <span className="block text-[12px] text-muted-foreground">Not due yet</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <button type="button" className="rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2">
                        <span className="block font-mono text-[12px] text-muted-foreground">{r.outgoingWorkerId}</span>
                        <span className="block font-medium hover:text-primary">{n.worker.get(r.outgoingWorkerId)?.name}</span>
                      </button>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {r.replacementWorkerId ? (
                        <>
                          <span className="block font-mono text-[12px] text-muted-foreground">{r.replacementWorkerId}</span>
                          <span className="block">{n.worker.get(r.replacementWorkerId)?.name}</span>
                        </>
                      ) : (
                        <span className="font-medium text-destructive">None assigned</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className="flex flex-wrap gap-1.5">
                        <Tag tone={TONE[v.status]}>{label(v.status)}</Tag>
                        {v.overdue && r.replacementWorkerId && <Tag tone="alert">Not reported</Tag>}
                      </span>
                    </TableCell>
                    <TableCell className={cx("px-4 py-3", !v.arrival && "text-muted-foreground")}>{fmtDT(v.arrival)}</TableCell>
                    <TableCell className={cx("px-4 py-3", !r.handoverAt && "text-muted-foreground")}>{fmtDT(r.handoverAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      )}
      <Sheet open={creating} onClose={() => setCreating(false)} title="New replacement" description="Pick the shift that needs a reliever at handover.">
        {creating && (
          <NewReplacement
            onDone={(id) => {
              setCreating(false);
              setOpenId(id);
            }}
          />
        )}
      </Sheet>
      <Sheet open={!!open && !creating} onClose={() => setOpenId(null)} title={open ? `Handover · ${fmtDT(open.plannedReportAt)}` : ""} wide>
        {open && <Detail key={open.id} r={open} onReplaced={(id) => setOpenId(id)} />}
      </Sheet>
    </div>
  );
}
