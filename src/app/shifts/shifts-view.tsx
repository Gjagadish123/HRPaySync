"use client";

import { Lock, MoonStar, Pencil, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { useStore } from "@/components/store";
import { Button, ConfirmDialog as Confirm, Empty, Field, PageHeader, ReadOnlyNote, Sheet, Tag, cx, useToast } from "@/components/app-ui";
import { ShiftChip } from "@/components/shift-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { addDays, fmtDate, fmtDur } from "@/lib/time";
import type { DateStr, ShiftTemplate } from "@/lib/types";
import { canSeeWorker } from "@/lib/world";


const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minsOf = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
/** Shift length in minutes. An end at or before the start is on the next day (same rule as shiftWindow). */
const lengthOf = (start: string, end: string) => (minsOf(end) - minsOf(start) + 1440) % 1440;
const isActive = (s: ShiftTemplate) => s.active !== false;
const NEW = "__new";

type Usage = { today: number; week: number; firstUsed: DateStr | null; future: number };
type Form = { code: string; name: string; start: string; end: string; breakMins: string; active: boolean };
type Errors = Partial<Record<keyof Form, string>>;

function futureLine(n: number) {
  return n === 1
    ? "1 future roster cell still uses it; it stays until changed in the Roster."
    : `${n} future roster cells still use it; they stay until changed in the Roster.`;
}

function check(f: Form, shifts: ShiftTemplate[], self?: ShiftTemplate): Errors {
  const e: Errors = {};
  if (!self) {
    const code = f.code.trim().toUpperCase();
    const taken = shifts.find((s) => s.code === code);
    if (!code) e.code = "Enter a code, like D or N2.";
    else if (!/^[A-Z0-9]{1,3}$/.test(code)) e.code = "Use 1–3 letters or digits, like D or N2.";
    else if (taken) e.code = `${code} is already used by ${taken.name}.`;
  }
  const name = f.name.trim();
  if (name.length < 2) e.name = "Enter a name for the shift, like Day 12h.";
  else if (name.length > 40) e.name = "Keep the name to 40 characters or fewer.";
  else if (shifts.some((s) => s.id !== self?.id && s.name.toLowerCase() === name.toLowerCase())) e.name = "Another shift already has this name.";
  if (!HHMM.test(f.start)) e.start = "Enter a start time.";
  if (!HHMM.test(f.end)) e.end = "Enter an end time.";
  const len = HHMM.test(f.start) && HHMM.test(f.end) ? lengthOf(f.start, f.end) : null;
  if (len === 0) e.end = "End must be different from start.";
  else if (len !== null && len < 60) e.end = `A shift must be at least 1 hour long; this one is ${fmtDur(len)}.`;
  else if (len !== null && len > 960) e.end = `A shift can be at most 16 hours long; this one is ${fmtDur(len)}.`;
  const brk = f.breakMins.trim();
  if (!/^\d{1,3}$/.test(brk) || +brk > 180) e.breakMins = "Enter whole minutes from 0 to 180.";
  else if (len && +brk >= len) e.breakMins = `The break must be shorter than the shift (${fmtDur(len)}).`;
  return e;
}

/** Confirmation dialog. Opened from state, so it remembers its opener and returns focus there (Radix only does that for a Trigger). */

function ShiftForm({ formId, shift, usage, onDone }: { formId: string; shift?: ShiftTemplate; usage?: Usage; onDone: () => void }) {
  const { world, dispatch } = useStore();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const lockId = useId();
  const activeId = useId();
  const [f, setF] = useState<Form>(() =>
    shift
      ? { code: shift.code, name: shift.name, start: shift.start, end: shift.end, breakMins: String(shift.breakMins), active: isActive(shift) }
      : { code: "", name: "", start: "06:00", end: "18:00", breakMins: "60", active: true },
  );
  // Errors appear after the first save attempt, then follow every edit.
  const [tried, setTried] = useState(false);
  const errors = tried ? check(f, world.shifts, shift) : {};
  const lockedFrom = usage?.firstUsed ?? null;
  const future = usage?.future ?? 0;
  const len = HHMM.test(f.start) && HHMM.test(f.end) ? lengthOf(f.start, f.end) : null;
  const brk = /^\d{1,3}$/.test(f.breakMins.trim()) && +f.breakMins <= 180 ? Number(f.breakMins.trim()) : null;
  const crosses = !!len && f.end < f.start;
  const timingChanged = !!shift && (f.start !== shift.start || f.end !== shift.end);
  const set = (k: "code" | "name" | "start" | "end" | "breakMins") => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const withLock = (p: { "aria-describedby"?: string }) => [p["aria-describedby"], lockedFrom ? lockId : ""].filter(Boolean).join(" ") || undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (Object.keys(check(f, world.shifts, shift)).length) {
      setTried(true);
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const code = shift?.code ?? f.code.trim().toUpperCase();
    const next: ShiftTemplate = {
      id: shift?.id ?? `s-${code.toLowerCase()}-${crypto.randomUUID().slice(0, 4)}`,
      code,
      name: f.name.trim(),
      // Timings of a shift that has been worked never change, so past attendance stays as recorded.
      start: shift && lockedFrom ? shift.start : f.start,
      end: shift && lockedFrom ? shift.end : f.end,
      breakMins: Number(f.breakMins.trim()),
      active: f.active,
    };
    if (!shift) {
      const res = dispatch({ type: "shift/create", shift: next }, `Created shift ${code} ${next.name} (${next.start}–${next.end}, break ${next.breakMins}m)`);
      if (!res.ok) return toast(res.error, "alert");
      toast(`Shift ${code} created. It can now be set in the Roster.`);
      return onDone();
    }
    const changes = [
      next.name !== shift.name && `name ${shift.name} → ${next.name}`,
      (next.start !== shift.start || next.end !== shift.end) && `timing ${shift.start}–${shift.end} → ${next.start}–${next.end}`,
      next.breakMins !== shift.breakMins && `break ${shift.breakMins}m → ${next.breakMins}m`,
      next.active !== isActive(shift) && (next.active ? "activated" : "deactivated"),
    ].filter(Boolean);
    if (!changes.length) return onDone();
    const res = dispatch({ type: "shift/update", shift: next }, `Updated shift ${code}: ${changes.join("; ")}`);
    if (!res.ok) return toast(res.error, "alert");
    toast(`Shift ${code} updated.${isActive(shift) && !next.active && future ? ` ${futureLine(future)}` : ""}`);
    onDone();
  }

  return (
    <form id={formId} ref={formRef} onSubmit={submit} noValidate aria-label={shift ? `Edit shift ${shift.code}` : "New shift"} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
        <Field label="Code" error={errors.code} hint={shift ? "Fixed after creation." : "1–3 letters or digits."}>
          {(p) => <input {...p} className="field font-mono uppercase" autoComplete="off" disabled={!!shift} value={f.code} onChange={set("code")} placeholder="N2" />}
        </Field>
        <Field label="Name" error={errors.name}>
          {(p) => <input {...p} className="field" autoComplete="off" value={f.name} onChange={set("name")} placeholder="Day 12h" />}
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start" error={errors.start}>
            {(p) => <input {...p} aria-describedby={withLock(p)} type="time" className="field tabular-nums" disabled={!!lockedFrom} value={f.start} onChange={set("start")} />}
          </Field>
          <Field label="End" error={errors.end}>
            {(p) => <input {...p} aria-describedby={withLock(p)} type="time" className="field tabular-nums" disabled={!!lockedFrom} value={f.end} onChange={set("end")} />}
          </Field>
        </div>
        {lockedFrom && (
          <p id={lockId} className="flex items-start gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>Already used from {fmtDate(lockedFrom)}; create a new shift to change timings.</span>
          </p>
        )}
        <p aria-live="polite" className="text-[13px] text-muted-foreground empty:hidden">
          {crosses && (
            <span className="inline-flex items-center gap-1.5">
              <MoonStar className="size-3.5 text-primary" aria-hidden />
              Crosses midnight: starts {f.start}, ends {f.end} the next day.
            </span>
          )}
        </p>
        {timingChanged && future > 0 && (
          <p className="text-[13px] text-muted-foreground">
            {future === 1 ? "1 future roster cell" : `${future} future roster cells`} will follow the new timings.
          </p>
        )}
      </div>

      <Field label="Break (minutes)" error={errors.breakMins} hint="0–180 minutes, taken out of net hours.">
        {(p) => <input {...p} inputMode="numeric" className="field tabular-nums sm:max-w-[140px]" value={f.breakMins} onChange={set("breakMins")} />}
      </Field>

      <dl className="grid grid-cols-3 divide-x rounded-lg border bg-muted/40 text-center">
        {[
          ["Length", len ? fmtDur(len) : "—"],
          ["Break", brk === null ? "—" : brk === 0 ? "None" : fmtDur(brk)],
          ["Net hours", len && brk !== null && brk < len ? fmtDur(len - brk) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="px-3 py-2.5">
            <dt className="text-[12px] text-muted-foreground">{k}</dt>
            <dd className="text-base font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {shift && (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2.5">
            <Checkbox id={activeId} checked={f.active} onCheckedChange={(c) => setF({ ...f, active: c === true })} className="mt-0.5" />
            <label htmlFor={activeId} className="label">
              Active
              <span className="block text-[13px] font-normal text-muted-foreground">Only active shifts can be set in the Roster. Inactive shifts keep their history.</span>
            </label>
          </div>
          {isActive(shift) && !f.active && future > 0 && (
            <p className="flex items-start gap-2 text-[13px] text-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              {futureLine(future)}
            </p>
          )}
        </div>
      )}
    </form>
  );
}

export function ShiftsView() {
  const { world, n, viewer, can, dispatch } = useStore();
  const toast = useToast();
  const formId = useId();
  const editable = can("editRoster");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const usage = useMemo(() => {
    const last = addDays(world.today, 7);
    const acc = new Map(world.shifts.map((s) => [s.id, { today: new Set<string>(), week: new Set<string>(), firstUsed: null as DateStr | null, future: 0 }]));
    for (const a of world.assignments) {
      const s = n.shift.get(a.shiftId);
      const u = acc.get(a.shiftId);
      if (!s || !u) continue;
      // Site-local "YYYY-MM-DDTHH:mm" strings sort in time order. Extra-duty shifts count too: their attendance uses these timings.
      if (`${a.date}T${s.start}` <= world.now) {
        if (!u.firstUsed || a.date < u.firstUsed) u.firstUsed = a.date;
      } else u.future++;
      if (a.date < world.today || a.date > last) continue;
      const w = n.worker.get(a.workerId);
      if (!w || !canSeeWorker(viewer, w, a.date)) continue;
      (a.date === world.today ? u.today : u.week).add(a.workerId);
    }
    return new Map<string, Usage>([...acc].map(([id, u]) => [id, { today: u.today.size, week: u.week.size, firstUsed: u.firstUsed, future: u.future }]));
  }, [world, n, viewer]);

  const target = editing === NEW ? undefined : world.shifts.find((s) => s.id === editing);
  const deactivating = world.shifts.find((s) => s.id === confirmId);
  const activeCount = world.shifts.filter(isActive).length;

  function setActive(s: ShiftTemplate, active: boolean) {
    const res = dispatch({ type: "shift/update", shift: { ...s, active } }, `${active ? "Activated" : "Deactivated"} shift ${s.code} (${s.name})`);
    if (!res.ok) return toast(res.error, "alert");
    const future = usage.get(s.id)?.future ?? 0;
    toast(active ? `Shift ${s.code} is active and can be set in the Roster.` : `Shift ${s.code} deactivated.${future ? ` ${futureLine(future)}` : ""}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Shifts"
        description="The shift templates the roster is planned with. Once a shift has been worked its timings are locked, so past attendance never changes."
        actions={
          editable && (
            <Button kind="tape" onClick={() => setEditing(NEW)}>
              <Plus aria-hidden />
              New shift
            </Button>
          )
        }
      />
      {!editable && <ReadOnlyNote>Only client admins and supervisors can create or change shifts.</ReadOnlyNote>}

      <Card className="gap-0 py-0 shadow-xs">
        <CardHeader className="border-b py-4">
          <CardTitle role="heading" aria-level={2} className="font-semibold">
            Shift templates
          </CardTitle>
          <CardDescription className="text-[13px]">
            {world.shifts.length} shift{world.shifts.length === 1 ? "" : "s"} · {activeCount} active. Rest and working-time limits are checked against the{" "}
            <Link href="/settings" className="font-medium text-primary underline-offset-4 hover:underline">
              policy in Settings
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {world.shifts.length === 0 ? (
            <div className="p-4">
              <Empty title="No shifts yet">{editable ? "Create the first shift to start planning the roster." : "A client admin or supervisor has not created any shifts yet."}</Empty>
            </div>
          ) : (
            // relative: sr-only labels inside are absolutely positioned; without it they escape the scroller.
            <div className="relative overflow-x-auto">
              <table className="grid-table [&_td]:align-middle">
                <thead>
                  <tr>
                    <th>Shift</th>
                    <th>Timing</th>
                    <th className="text-right">Length</th>
                    <th className="text-right">Break</th>
                    <th className="text-right">Net</th>
                    <th className="text-right" title="Workers rostered today">Today</th>
                    <th className="text-right" title="Workers rostered in the next 7 days">Next 7 days</th>
                    <th>Status</th>
                    {editable && (
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {world.shifts.map((s) => {
                    const active = isActive(s);
                    const len = lengthOf(s.start, s.end);
                    const u = usage.get(s.id);
                    return (
                      <tr key={s.id} className={cx(!active && "text-muted-foreground")}>
                        <td>
                          <span className="flex items-center gap-2.5">
                            <ShiftChip code={s.code} className={active ? undefined : "opacity-60"} />
                            <span className="font-medium whitespace-nowrap">{s.name}</span>
                          </span>
                        </td>
                        <td>
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <span className="font-mono text-[13px]">
                              {s.start}–{s.end}
                            </span>
                            {s.end <= s.start && (
                              <Tag tone="day">
                                <MoonStar aria-hidden />
                                Crosses midnight
                              </Tag>
                            )}
                          </span>
                        </td>
                        <td className="text-right tabular-nums">{fmtDur(len)}</td>
                        <td className="text-right tabular-nums">{s.breakMins ? fmtDur(s.breakMins) : "None"}</td>
                        <td className="text-right font-medium tabular-nums">{fmtDur(len - s.breakMins)}</td>
                        <td className="text-right tabular-nums">{u?.today ?? 0}</td>
                        <td className="text-right tabular-nums">{u?.week ?? 0}</td>
                        <td>
                          <Tag tone={active ? "ok" : "muted"}>{active ? "Active" : "Inactive"}</Tag>
                        </td>
                        {editable && (
                          <td>
                            <span className="flex justify-end gap-1.5">
                              <Button size="sm" aria-label={`Edit shift ${s.code}`} onClick={() => setEditing(s.id)}>
                                <Pencil aria-hidden />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                aria-label={`${active ? "Deactivate" : "Activate"} shift ${s.code}`}
                                onClick={() => (active ? setConfirmId(s.id) : setActive(s, true))}
                              >
                                {active ? "Deactivate" : "Activate"}
                              </Button>
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-[13px] text-muted-foreground">
        Today and Next 7 days count workers rostered on each shift{viewer.role === "CONTRACTOR_ADMIN" ? " from your contractor" : ""}. Set shifts per worker in the{" "}
        <Link href="/roster" className="font-medium text-primary underline-offset-4 hover:underline">
          Roster
        </Link>
        .
      </p>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={target ? `Edit shift ${target.code}` : "New shift"}
        description={target ? target.name : "Add a shift template. It can be set in the Roster as soon as it is created."}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button kind="tape" type="submit" form={formId}>
              {target ? "Save changes" : "Create shift"}
            </Button>
          </>
        }
      >
        {editing !== null && (
          <ShiftForm key={editing} formId={formId} shift={target} usage={target ? usage.get(target.id) : undefined} onDone={() => setEditing(null)} />
        )}
      </Sheet>

      <Confirm
        open={!!deactivating}
        title={deactivating ? `Deactivate shift ${deactivating.code}?` : ""}
        action="Deactivate"
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (deactivating) setActive(deactivating, false);
          setConfirmId(null);
        }}
      >
        It will no longer be offered in the Roster. Past attendance is kept.{" "}
        {deactivating && (usage.get(deactivating.id)?.future ? futureLine(usage.get(deactivating.id)!.future) : "No future roster cells use it.")}
      </Confirm>
    </div>
  );
}
