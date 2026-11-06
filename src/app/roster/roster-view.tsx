"use client";

import { ChevronLeft, ChevronRight, TimerReset } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/components/store";
import { Button, Field, PageHeader, ReadOnlyNote, Tag, buttonClass, cx, useToast } from "@/components/app-ui";
import { ShiftChip as Chip } from "@/components/shift-chip";
import { shiftStarted } from "@/lib/attendance";
import { rosterConflicts } from "@/lib/compliance";
import { addDays, dateRange, fmtDate, weekdayIndex } from "@/lib/time";
import { canSeeDeployment, deploymentOf, isHoliday } from "@/lib/world";

function mondayOf(date: string) {
  return addDays(date, -((weekdayIndex(date) + 6) % 7));
}

export function RosterView() {
  const { world, n, viewer, can, dispatch } = useStore();
  const toast = useToast();
  const deployments = world.deployments.filter((d) => canSeeDeployment(viewer, d));
  const [depId, setDepId] = useState(deployments[0]?.id ?? "");
  const [week, setWeek] = useState(() => mondayOf(world.today));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const days = useMemo(() => dateRange(week, addDays(week, 6)), [week]);
  const dep = deployments.find((d) => d.id === depId) ?? deployments[0];
  const editable = can("editRoster");

  // Inactive workers stay only while they still hold a shift in this week, and then read-only.
  const workers = useMemo(
    () =>
      dep
        ? world.workers.filter(
            (w) =>
              (w.active || world.assignments.some((a) => a.workerId === w.id && a.date >= days[0] && a.date <= days[6])) &&
              days.some((d) => deploymentOf(world, w, d)?.id === dep.id),
          )
        : [],
    [world, dep, days],
  );
  const grid = useMemo(() => {
    const ids = new Set(workers.map((w) => w.id));
    const map = new Map<string, typeof world.assignments>();
    for (const a of world.assignments) {
      if (!ids.has(a.workerId) || a.date < days[0] || a.date > days[6]) continue;
      const k = `${a.workerId}|${a.date}`;
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return map;
  }, [world, workers, days]);
  const conflicts = useMemo(() => {
    const ids = new Set(workers.map((w) => w.id));
    return rosterConflicts(world, world.assignments.filter((a) => ids.has(a.workerId) && a.date >= addDays(days[0], -1) && a.date <= days[6]));
  }, [world, workers, days]);

  const started = (k: string) =>
    (grid.get(k) ?? []).some((a) => {
      const s = n.shift.get(a.shiftId);
      return !!s && shiftStarted(a, s, world.now);
    });

  const toggle = (k: string) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
  };

  function apply(shiftId: string | null) {
    // The clock may have passed a shift start while cells were selected.
    if ([...selected].some(started)) {
      setSelected(new Set([...selected].filter((k) => !started(k))));
      return toast("A selected shift has already started, so it is locked. It was removed from the selection.", "alert");
    }
    const cells = [...selected].map((k) => {
      const [workerId, date] = k.split("|");
      return { workerId, date };
    });
    const label = shiftId ? n.shift.get(shiftId)?.code : "rest";
    const res = dispatch({ type: "roster/set", cells, shiftId }, `Roster: set ${cells.length} cell${cells.length > 1 ? "s" : ""} to ${label}`);
    if (!res.ok) return toast(res.error, "alert");
    toast(`${cells.length} roster cell${cells.length > 1 ? "s" : ""} set to ${label}.`);
    setSelected(new Set());
  }

  const goWeek = (w: string) => {
    setWeek(w);
    setSelected(new Set());
  };
  const thisWeek = mondayOf(world.today);
  const conflictCount = [...grid.values()].flat().filter((a) => conflicts.has(a.id)).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Roster"
        description={
          <>
            Planned shifts per worker. The schedule is kept separate from actual punches; rest gaps and overlaps are flagged from the policy. Shift timings are set in{" "}
            <Link href="/shifts" className="font-medium text-primary underline-offset-4 hover:underline">Shifts</Link>.
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Deployment" className="w-full sm:w-auto sm:min-w-[280px]">
          {(p) => (
            <select {...p} className="field" value={dep?.id ?? ""} onChange={(e) => { setDepId(e.target.value); setSelected(new Set()); }}>
              {deployments.map((d) => (
                <option key={d.id} value={d.id}>{n.deploymentLabel(d)}</option>
              ))}
            </select>
          )}
        </Field>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg shadow-xs" role="group" aria-label="Week">
            <Button aria-label="Previous week" className="rounded-r-none px-2.5" onClick={() => goWeek(addDays(week, -7))}>
              <ChevronLeft aria-hidden />
            </Button>
            <span className="flex h-9 min-w-[148px] items-center justify-center border-y bg-background px-3 text-[14px] font-medium" aria-live="polite">
              {fmtDate(days[0], false)} – {fmtDate(days[6], false)}
            </span>
            <Button aria-label="Next week" className="rounded-l-none px-2.5" onClick={() => goWeek(addDays(week, 7))}>
              <ChevronRight aria-hidden />
            </Button>
          </div>
          <Button disabled={week === thisWeek} onClick={() => goWeek(thisWeek)}>This week</Button>
        </div>
        {conflictCount > 0 && (
          <Tag tone="alert" className="mb-2 sm:ml-auto">{conflictCount} rest / overlap flag{conflictCount > 1 ? "s" : ""}</Tag>
        )}
      </div>

      {editable ? (
        <div className="sticky top-[57px] z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <span className={cx("mr-2 text-[14px]", selected.size ? "font-medium text-foreground" : "text-muted-foreground")} aria-live="polite">
            {selected.size ? `${selected.size} cell${selected.size > 1 ? "s" : ""} selected` : "Select cells from today onwards, then set a shift"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {world.shifts.filter((s) => s.active !== false).map((s) => (
              <Button key={s.id} size="sm" kind="plain" disabled={!selected.size} onClick={() => apply(s.id)}>Set {s.code}</Button>
            ))}
            <Button size="sm" kind="plain" disabled={!selected.size} onClick={() => apply(null)}>Set rest</Button>
            {selected.size > 0 && <Button size="sm" kind="quiet" className="ml-1" onClick={() => setSelected(new Set())}>Clear</Button>}
          </div>
          <Link href="/shifts" className={cx(buttonClass("quiet", "sm"), "ml-auto")}>
            <TimerReset aria-hidden />
            Manage shifts
          </Link>
        </div>
      ) : (
        <ReadOnlyNote>Only client admins and supervisors can change the roster.</ReadOnlyNote>
      )}

      <div className="relative overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="grid-table">
          <thead>
            <tr>
              <th className="sticky left-0 z-[2] min-w-[140px] sm:min-w-[190px]">Worker</th>
              {days.map((d) => {
                const hol = isHoliday(world, d);
                const [dow, ...date] = fmtDate(d).split(" ");
                const today = d === world.today;
                return (
                  <th key={d} className={cx("min-w-[76px] py-1.5 text-center leading-tight", today && "bg-accent text-accent-foreground")}>
                    <span className="block text-[12px] font-normal">{dow}{today ? " · Today" : ""}</span>
                    <span className={cx("block text-[13px] font-medium", d < world.today ? "text-muted-foreground" : "text-foreground", today && "text-accent-foreground")}>{date.join(" ")}</span>
                    {hol && <span className="block text-[11px] font-medium text-destructive">{hol.name}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id}>
                <td className="sticky left-0 z-[1] bg-card py-2">
                  <span className="block font-mono text-[12px] text-muted-foreground">{w.id}</span>
                  <span className="whitespace-nowrap font-medium">{w.name}</span>
                  {!w.active && <span className="block text-[12px] text-muted-foreground">Inactive</span>}
                </td>
                {days.map((d) => {
                  const k = `${w.id}|${d}`;
                  const list = grid.get(k) ?? [];
                  const inDep = deploymentOf(world, w, d)?.id === dep?.id;
                  const past = d < world.today;
                  const running = !past && started(k);
                  const sel = selected.has(k);
                  const flag = list.map((a) => conflicts.get(a.id)).find(Boolean);
                  const locked = past || running || !w.active;
                  const open = editable && !locked && inDep;
                  return (
                    <td key={d} className={cx("p-1 align-middle", locked && "bg-muted/50")}>
                      <button
                        type="button"
                        disabled={!open}
                        onClick={() => toggle(k)}
                        aria-pressed={sel}
                        aria-label={`${w.id} ${fmtDate(d)}: ${list.map((a) => n.shift.get(a.shiftId)?.code).join(", ") || "rest"}${flag ? `, ${flag}` : ""}`}
                        title={!w.active ? "Inactive worker" : (flag ?? (past ? "Past day, locked" : running ? "Shift already started, locked" : undefined))}
                        className={cx(
                          "relative flex min-h-9 w-full items-center justify-center gap-1 overflow-hidden rounded-md px-1 transition-colors ease-out outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          open && "hover:bg-muted",
                          locked && "cursor-not-allowed",
                          sel && "bg-accent ring-2 ring-primary hover:bg-accent",
                        )}
                      >
                        {!inDep ? (
                          <span className="text-[12px] text-muted-foreground">Moved</span>
                        ) : list.length === 0 ? (
                          <span className="text-muted-foreground" aria-hidden>–</span>
                        ) : (
                          list.map((a) => (
                            <Chip key={a.id} code={n.shift.get(a.shiftId)?.code ?? ""} prefix={a.extraDutyId ? "+" : ""} className={past ? "opacity-60" : undefined} />
                          ))
                        )}
                        {flag && <span aria-hidden className="absolute top-0 right-0 size-0 border-t-[8px] border-l-[8px] border-t-destructive border-l-transparent" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
        {world.shifts.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <Chip code={s.code} className={s.active === false ? "opacity-60" : undefined} />
            {s.name}{s.active === false ? " (inactive)" : ""}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><Chip code="+" /> Extra duty</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="relative size-6 overflow-hidden rounded-md border bg-background">
            <span className="absolute top-0 right-0 size-0 border-t-[8px] border-l-[8px] border-t-destructive border-l-transparent" />
          </span>
          Too little rest or overlap
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-6 rounded-md bg-muted" />
          Past day, shift already started or inactive worker, locked
        </span>
      </div>
    </div>
  );
}
