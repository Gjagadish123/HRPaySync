"use client";

// Monthly register: one row per worker, one column per day of the month, then month-to-date totals.
// Built for ~200 workers x 31 days: the grid is derived once per month (memoised), rendered as plain
// elements, and every cell shares one floating detail card driven by event delegation on the scroller.
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { STATUS, STATUS_ORDER, StatusIcon, StatusLegend, statusOf, type DayStatus } from "@/components/status";
import { useStore } from "@/components/store";
import { Button, Empty, Field, Panel, Tag, cx } from "@/components/app-ui";
import { isPresent, type AttendanceIndex, type Session } from "@/lib/attendance";
import { formalExtraDuty } from "@/lib/workflow";
import { addMonths, dateOf, fmtDT, fmtDate, fmtDur, fmtMonth, monthDays, monthOf, timeOf, weekdayIndex } from "@/lib/time";
import type { Deployment, Viewer, Worker, World } from "@/lib/types";
import { assignmentOn, canSeeDeployment, deploymentKey, type Names } from "@/lib/world";

const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const NONE: Session[] = [];

type Marker = "EXTRA" | "DISPUTED" | "MANUAL";
type StatusFilter = DayStatus | Marker | "";
const MARKER_LABEL: Record<Marker, string> = { EXTRA: "Extra duty", DISPUTED: "Disputed", MANUAL: "Manual punch" };

interface Cell {
  /** null: not deployed with a contractor this viewer may see, not yet joined, or beyond the published roster. */
  st: DayStatus | null;
  /** The regular shift that day, else the extra-duty shift. */
  s?: Session;
  others: Session[];
  extra: boolean;
  disputed: boolean;
  manual: boolean;
  label: string;
}

interface Totals {
  rostered: number;
  present: number;
  late: number;
  missing: number;
  absent: number;
  rest: number;
  holidays: number;
  extraMins: number;
}

interface Row {
  w: Worker;
  /** Deployment on the latest visible day up to today, for the sub-line. */
  dep: Deployment;
  contractors: Set<string>;
  departments: Set<string>;
  shifts: Set<string>;
  has: Set<StatusFilter>;
  cells: Cell[];
  sum: Totals;
  search: string;
}

function buildRegister(world: World, idx: AttendanceIndex, viewer: Viewer, month: string) {
  const days = monthDays(month);
  const holidays = new Map(world.holidays.map((h) => [h.date, h.name]));
  const deps = new Map(world.deployments.map((d) => [deploymentKey(d.contractorId, d.departmentId), d]));
  // Beyond the last rostered date a day with no shift is unknown, not a rest day.
  let horizon = world.today;
  for (const d of idx.byDate.keys()) if (d > horizon) horizon = d;
  const dayText = days.map((d) => (holidays.has(d) ? `${fmtDate(d)} (${holidays.get(d)})` : fmtDate(d)));
  const formal = formalExtraDuty(world);
  const rows: Row[] = [];

  for (const w of world.workers) {
    const byDay = new Map<string, Session[]>();
    for (const s of idx.byWorker.get(w.id) ?? NONE) {
      if (monthOf(s.assignment.date) !== month) continue;
      const list = byDay.get(s.assignment.date);
      if (list) list.push(s);
      else byDay.set(s.assignment.date, [s]);
    }
    if (!w.active && byDay.size === 0) continue;

    const row: Row = {
      w,
      dep: undefined as unknown as Deployment,
      contractors: new Set(),
      departments: new Set(),
      shifts: new Set(),
      has: new Set(),
      cells: [],
      sum: { rostered: 0, present: 0, late: 0, missing: 0, absent: 0, rest: 0, holidays: 0, extraMins: 0 },
      search: `${w.id} ${w.name} ${w.deviceId}`.toLowerCase(),
    };
    let firstDep: Deployment | undefined;

    days.forEach((d, i) => {
      const a = assignmentOn(w, d);
      const dep = a && deps.get(deploymentKey(a.contractorId, a.departmentId));
      if (!dep || !canSeeDeployment(viewer, dep) || (w.joinedOn && d < w.joinedOn)) {
        row.cells.push({ st: null, others: NONE, extra: false, disputed: false, manual: false, label: `${w.name}, ${dayText[i]}: not deployed` });
        return;
      }
      firstDep ??= dep;
      if (d <= world.today) row.dep = dep;
      row.contractors.add(dep.contractorId);
      row.departments.add(dep.departmentId);

      const list = byDay.get(d) ?? NONE;
      const s = list.find((x) => !x.assignment.extraDutyId) ?? list[0];
      const st: DayStatus | null = s ? statusOf(s) : d > horizon ? null : holidays.has(d) ? "HOLIDAY" : "REST";
      const toDate = d <= world.today;
      let extra = false;
      let overstay = false;
      let disputed = false;
      let manual = false;
      for (const x of list) {
        const v = world.verifications[x.assignment.id];
        const kind = formal.get(x.assignment.id);
        if (kind) extra = true;
        else if (x.extensionMins > 0) overstay = true;
        if (v?.client === "DISPUTED" && !v.resolved) disputed = true;
        if (x.hasManual) manual = true;
        row.shifts.add(x.assignment.shiftId);
        row.has.add(statusOf(x));
        // Late means a late arrival, even when the cell shows Missing OUT; the Late total uses the same rule.
        if (x.lateMins > 0) row.has.add("LATE");
        if (!toDate || x.status === "UPCOMING") continue;
        row.sum.rostered++;
        if (isPresent(x)) row.sum.present++;
        if (x.lateMins > 0) row.sum.late++;
        if (x.status === "MISSING_OUT") row.sum.missing++;
        if (x.status === "ABSENT") row.sum.absent++;
        // Formal extra duty only: an extension counts its time past the shift end, an additional shift counts whole
        // (unless its OUT is missing, when the time is unknown). Plain overstay is not extra duty.
        if (kind === "EXTENSION") row.sum.extraMins += x.extensionMins;
        else if (kind === "ADDITIONAL_SHIFT" && x.status !== "MISSING_OUT") row.sum.extraMins += x.netMins;
      }
      if (toDate && st === "REST") row.sum.rest++;
      if (toDate && st === "HOLIDAY") row.sum.holidays++;
      if (st) row.has.add(st);
      if (extra) row.has.add("EXTRA");
      if (disputed) row.has.add("DISPUTED");
      if (manual) row.has.add("MANUAL");

      let label = `${w.name}, ${dayText[i]}: ${st ? STATUS[st].label : "no roster yet"}`;
      if (s) {
        label += `, ${s.shift.code} shift ${s.shift.start}–${s.shift.end}`;
        if (s.in) label += `, IN ${timeOf(s.in)}`;
        if (s.out) label += `, OUT ${timeOf(s.out)}`;
      }
      if (list.length > 1) label += `, ${list.length} shifts`;
      if (extra) label += ", extra duty";
      if (overstay) label += ", worked past shift without an extra-duty request";
      if (disputed) label += ", disputed";
      if (manual) label += ", manual punch";
      row.cells.push({ st, s, others: list.length > 1 ? list.filter((x) => x !== s) : NONE, extra, disputed, manual, label });
    });

    if (!firstDep) continue;
    row.dep ??= firstDep;
    rows.push(row);
  }
  rows.sort((a, b) => a.w.id.localeCompare(b.w.id));
  return { days, rows, horizon, holidayNames: days.map((d) => holidays.get(d)), todayIdx: days.indexOf(world.today) };
}

const CELL =
  "relative mx-auto flex size-7 items-center justify-center rounded-md outline-none transition-shadow duration-150 ease-out hover:ring-2 hover:ring-foreground/15 focus-visible:ring-2 focus-visible:ring-ring";
const CELL_CLASS = Object.fromEntries(STATUS_ORDER.map((s) => [s, `${CELL} ${STATUS[s].soft} ${STATUS[s].text}`])) as Record<DayStatus, string>;
const CELL_EMPTY = `${CELL} cursor-default text-muted-foreground/40`;

// Each icon is drawn once as a <symbol>; cells point at it with <use>, so ~6,000 cells stay plain elements
// instead of 6,000 icon components (the difference between a slow and an instant month switch).
const SPRITE = (
  <svg aria-hidden width="0" height="0" className="absolute">
    {STATUS_ORDER.map((s) => {
      const Icon = STATUS[s].icon;
      return (
        <symbol key={s} id={`att-reg-${s}`} viewBox="0 0 24 24">
          <Icon strokeWidth={2.5} />
        </symbol>
      );
    })}
    <symbol id="att-reg-plus" viewBox="0 0 24 24">
      <Plus strokeWidth={3.5} />
    </symbol>
  </svg>
);
const HREF = Object.fromEntries(STATUS_ORDER.map((s) => [s, `#att-reg-${s}`])) as Record<DayStatus, string>;

function rateClass(pct: number) {
  return pct >= 90 ? STATUS.PRESENT.text : pct >= 75 ? STATUS.LATE.text : STATUS.ABSENT.text;
}

function Markers() {
  return (
    <>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="grid size-3 place-items-center rounded-full bg-primary text-primary-foreground">
          <Plus className="size-2.5" strokeWidth={3.5} />
        </span>
        Extra duty (request or extra shift)
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2 rounded-full bg-destructive" />
        Disputed
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-2 rounded-full border-[1.5px] border-foreground/70" />
        Manual punch
      </li>
    </>
  );
}

interface Hover {
  row: Row;
  c: number;
  rect: DOMRect;
}

/** One worker's month. Memoised, so filtering only mounts the rows that newly appear. */
const RegisterRow = memo(function RegisterRow({ row, colClass, n }: { row: Row; colClass: string[]; n: Names }) {
  const { w, sum } = row;
  const sub = `${n.contractor.get(row.dep.contractorId)?.name ?? ""} · ${n.department.get(row.dep.departmentId)?.name ?? ""}`;
  const pct = sum.rostered ? Math.round((sum.present / sum.rostered) * 100) : null;
  return (
    <tr data-w={w.id} className="group">
      <th scope="row" className="top-auto left-0 z-10 h-auto bg-card px-3 py-1 align-middle font-mono text-[12px] font-normal text-foreground group-hover:bg-muted">
        {w.id}
      </th>
      <td className="max-w-[220px] min-w-[200px] border-r bg-card py-1 align-middle leading-tight group-hover:bg-muted sm:sticky sm:left-[88px] sm:z-10">
        <span className="block truncate font-medium">{w.name}</span>
        <span className="block truncate text-[12px] text-muted-foreground" title={sub}>{sub}</span>
      </td>
      {row.cells.map((cell, c) => (
        <td key={c} className={colClass[c]}>
          <button
            type="button"
            tabIndex={-1}
            data-c={c}
            aria-label={cell.label}
            aria-disabled={cell.s ? undefined : true}
            className={cell.st ? (cell.s ? CELL_CLASS[cell.st] : `${CELL_CLASS[cell.st]} cursor-default`) : CELL_EMPTY}
          >
            {cell.st ? (
              <svg aria-hidden className="size-3.5">
                <use href={HREF[cell.st]} />
              </svg>
            ) : (
              <span aria-hidden>·</span>
            )}
            {cell.extra && (
              <span aria-hidden className="absolute -top-1 -right-1 grid size-3 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                <svg className="size-2.5">
                  <use href="#att-reg-plus" />
                </svg>
              </span>
            )}
            {cell.disputed && <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-destructive ring-2 ring-card" />}
            {cell.manual && <span aria-hidden className="absolute -bottom-0.5 -left-0.5 size-2 rounded-full border-[1.5px] border-foreground/70 bg-card" />}
          </button>
        </td>
      ))}
      <td className="num border-l py-1 align-middle">{sum.rostered}</td>
      <td className="num py-1 align-middle font-medium">{sum.present}</td>
      <td className={cx("num py-1 align-middle", sum.late ? STATUS.LATE.text : "text-muted-foreground")}>{sum.late}</td>
      <td className={cx("num py-1 align-middle", sum.missing ? STATUS.MISSING_OUT.text : "text-muted-foreground")}>{sum.missing}</td>
      <td className={cx("num py-1 align-middle", sum.absent ? STATUS.ABSENT.text : "text-muted-foreground")}>{sum.absent}</td>
      <td className="num py-1 align-middle text-muted-foreground">{sum.rest}</td>
      <td className="num py-1 align-middle text-muted-foreground">{sum.holidays}</td>
      <td className={cx("num py-1 align-middle whitespace-nowrap", sum.extraMins ? "text-primary" : "text-muted-foreground")}>
        {sum.extraMins ? fmtDur(sum.extraMins) : "—"}
      </td>
      <td className={cx("num py-1 align-middle font-semibold", pct === null ? "text-muted-foreground" : rateClass(pct))}>{pct === null ? "—" : `${pct}%`}</td>
    </tr>
  );
});

const cellOf = (t: EventTarget) => (t instanceof Element ? t.closest<HTMLButtonElement>("button[data-c]") : null);
const workerOf = (b: Element) => b.closest<HTMLElement>("tr")?.dataset.w ?? "";

export function MonthlyRegister({ onOpen }: { onOpen: (assignmentId: string) => void }) {
  const { world, idx, n, viewer } = useStore();
  const thisMonth = monthOf(world.today);
  const [month, setMonth] = useState(thisMonth);
  const [contractor, setContractor] = useState("");
  const [department, setDepartment] = useState("");
  const [shift, setShift] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<Hover | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLButtonElement | null>(null);

  const firstMonth = useMemo(() => {
    let first = world.today;
    for (const d of idx.byDate.keys()) if (d < first) first = d;
    return monthOf(first);
  }, [idx, world.today]);

  // Re-rendering thousands of cells is not instant, so the controls answer at once and the grid follows.
  const filters = useMemo(() => ({ contractor, department, shift, status, q: query.trim().toLowerCase() }), [contractor, department, shift, status, query]);
  const f = useDeferredValue(filters);
  const shownMonth = useDeferredValue(month);
  const stale = f !== filters || shownMonth !== month;

  const model = useMemo(() => buildRegister(world, idx, viewer, shownMonth), [world, idx, viewer, shownMonth]);
  const byId = useMemo(() => new Map(model.rows.map((r) => [r.w.id, r])), [model]);
  const visible = useMemo(
    () =>
      model.rows.filter(
        (r) =>
          (!f.contractor || r.contractors.has(f.contractor)) &&
          (!f.department || r.departments.has(f.department)) &&
          (!f.shift || r.shifts.has(f.shift)) &&
          (!f.status || r.has.has(f.status)) &&
          (!f.q || r.search.includes(f.q)),
      ),
    [model, f],
  );
  const colClass = useMemo(
    () => model.days.map((_, j) => cx("px-0.5 py-1 align-middle", j === model.todayIdx ? "bg-accent/60" : model.holidayNames[j] && "bg-status-holiday/6")),
    [model],
  );

  // The table only changes with the rows, so hovering (which re-renders this component) never re-renders the grid.
  const table = useMemo(() => {
    const { days, holidayNames, todayIdx } = model;
    return (
      <table className="grid-table">
        <caption className="sr-only">
          Attendance register for {fmtMonth(shownMonth)}: one row per worker, one column per day, then totals to date
        </caption>
        <thead>
          <tr>
            <th scope="col" className="left-0 z-30 h-12 w-[88px] min-w-[88px] align-middle">Code</th>
            <th scope="col" className="z-20 h-12 min-w-[200px] border-r align-middle sm:left-[88px] sm:z-30">Name</th>
            {days.map((d, j) => {
              const hol = holidayNames[j];
              const today = j === todayIdx;
              return (
                <th
                  key={d}
                  scope="col"
                  title={hol}
                  className={cx(
                    "h-12 w-8 min-w-8 px-0 text-center align-middle",
                    today ? "bg-accent text-accent-foreground" : hol && cx("bg-[color-mix(in_oklch,var(--status-holiday)_12%,var(--muted))]", STATUS.HOLIDAY.text),
                  )}
                >
                  <span className={cx("block text-[13px] leading-4 font-semibold tabular-nums", today ? "text-primary" : !hol && "text-foreground")}>{Number(d.slice(8))}</span>
                  <span className="block text-[11px] leading-4 font-normal">{WEEKDAY[weekdayIndex(d)]}</span>
                  {today && <span className="sr-only">, today</span>}
                  {hol && <span className="sr-only">, {hol}</span>}
                </th>
              );
            })}
            <th scope="col" className="h-12 border-l text-right align-middle" title="Shifts rostered that have started, up to today">Rostered</th>
            <th scope="col" className="h-12 text-right align-middle" title="Worked: present, late, missing OUT or on duty">Present</th>
            <th scope="col" className="h-12 text-right align-middle" title="Late arrivals, including days with a missing OUT">Late</th>
            <th scope="col" className="h-12 text-right align-middle">Missing OUT</th>
            <th scope="col" className="h-12 text-right align-middle">Absent</th>
            <th scope="col" className="h-12 text-right align-middle">Rest</th>
            <th scope="col" className="h-12 text-right align-middle">Holidays</th>
            <th scope="col" className="h-12 text-right align-middle" title="Time past the shift end under an extra-duty request, plus extra-duty shifts">Extra duty</th>
            <th scope="col" className="h-12 text-right align-middle" title="Present out of rostered">Rate</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <RegisterRow key={row.w.id} row={row} colClass={colClass} n={n} />
          ))}
        </tbody>
      </table>
    );
  }, [model, visible, colClass, shownMonth, n]);

  // Roving tab stop: exactly one cell is in the tab order; arrow keys move between cells.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const stops = root.querySelectorAll<HTMLButtonElement>('button[data-c][tabindex="0"]');
    if (stops.length === 1) return;
    stops.forEach((b) => (b.tabIndex = -1));
    const first = root.querySelector<HTMLButtonElement>("button[data-c]");
    if (first) first.tabIndex = 0;
    active.current = first;
  }, [table]);

  // The card is anchored to a cell, so a scroll or resize hides it rather than leaving it adrift. The one
  // exception is a keyboard-focused cell (moving focus scrolls it into view): the card follows that cell.
  const shown = !!hover;
  useEffect(() => {
    if (!shown) return;
    const onScroll = () => {
      const a = document.activeElement;
      const b = a instanceof HTMLButtonElement && a.dataset.c && scroller.current?.contains(a) ? a : null;
      setHover((h) => (h && b && h.row.w.id === workerOf(b) && h.c === Number(b.dataset.c) ? { ...h, rect: b.getBoundingClientRect() } : null));
    };
    const hide = () => setHover(null);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", hide);
    };
  }, [shown]);

  function show(b: HTMLButtonElement) {
    const row = byId.get(workerOf(b));
    const c = Number(b.dataset.c);
    if (!row?.cells[c]?.st) return setHover(null);
    setHover((h) => (h && h.row === row && h.c === c ? h : { row, c, rect: b.getBoundingClientRect() }));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const b = cellOf(e.target);
    const tr = b?.closest("tr");
    if (!b || !tr) return;
    let c = Number(b.dataset.c);
    let to: Element | null = tr;
    const lastC = model.days.length - 1;
    switch (e.key) {
      case "ArrowRight":
        c = Math.min(lastC, c + 1);
        break;
      case "ArrowLeft":
        c = Math.max(0, c - 1);
        break;
      case "ArrowDown":
        to = tr.nextElementSibling;
        break;
      case "ArrowUp":
        to = tr.previousElementSibling;
        break;
      case "Home":
        c = 0;
        if (e.ctrlKey) to = tr.parentElement?.firstElementChild ?? tr;
        break;
      case "End":
        c = lastC;
        if (e.ctrlKey) to = tr.parentElement?.lastElementChild ?? tr;
        break;
      case "Escape":
        setHover(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    to?.querySelector<HTMLButtonElement>(`button[data-c="${c}"]`)?.focus();
  }

  const cur = hover && byId.get(hover.row.w.id) === hover.row && visible.includes(hover.row) ? hover.row.cells[hover.c] : undefined;
  const visibleContractors = world.contractors.filter((c) => viewer.role !== "CONTRACTOR_ADMIN" || c.id === viewer.contractorId);
  const filtered = !!(f.contractor || f.department || f.shift || f.status || f.q);

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" className="w-8 px-0" aria-label="Previous month" disabled={month <= firstMonth} onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft aria-hidden />
            </Button>
            <h2 className="min-w-[9ch] text-center text-base font-semibold tabular-nums" aria-live="polite">
              {fmtMonth(month)}
            </h2>
            <Button size="sm" className="w-8 px-0" aria-label="Next month" disabled={month >= thisMonth} onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight aria-hidden />
            </Button>
            {month !== thisMonth && (
              <Button size="sm" kind="quiet" className="ml-2" onClick={() => setMonth(thisMonth)}>
                This month
              </Button>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground">
            {month === thisMonth ? `Totals up to today, ${fmtDate(world.today)}` : "Totals for the whole month"}
          </p>
        </div>
        <div role="group" aria-label="Filters" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {viewer.role !== "CONTRACTOR_ADMIN" && (
            <Field label="Contractor">
              {(p) => (
                <select {...p} className="field" value={contractor} onChange={(e) => setContractor(e.target.value)}>
                  <option value="">All contractors</option>
                  {visibleContractors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label="Department">
            {(p) => (
              <select {...p} className="field" value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">All departments</option>
                {world.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Shift">
            {(p) => (
              <select {...p} className="field" value={shift} onChange={(e) => setShift(e.target.value)}>
                <option value="">All shifts</option>
                {world.shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} · {s.start}–{s.end}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Has a day that is">
            {(p) => (
              <select {...p} className="field" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <option value="">Any status</option>
                <optgroup label="Day status">
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{STATUS[s].label}</option>
                  ))}
                </optgroup>
                <optgroup label="Markers">
                  {(Object.keys(MARKER_LABEL) as Marker[]).map((k) => (
                    <option key={k} value={k}>{MARKER_LABEL[k]}</option>
                  ))}
                </optgroup>
              </select>
            )}
          </Field>
          <Field label="Worker" className="col-span-2 sm:col-span-1">
            {(p) => <input {...p} type="search" className="field" placeholder="Code, name or device ID" value={query} onChange={(e) => setQuery(e.target.value)} />}
          </Field>
        </div>
      </Panel>

      <div className="flex flex-col gap-2">
        <StatusLegend extra={<Markers />} />
        <p className="text-[12px] text-muted-foreground">
          Late counts late arrivals, including days with a missing OUT. Point at a day, or move with the arrow keys, to see its details. Click or press Enter to open the shift.
        </p>
      </div>

      <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
        <span className="font-semibold text-foreground">{visible.length}</span>
        {filtered ? ` of ${model.rows.length}` : ""} worker{(filtered ? model.rows.length : visible.length) === 1 ? "" : "s"}
      </p>

      {model.rows.length === 0 ? (
        <Empty title={`No workers in ${fmtMonth(shownMonth)}`}>Nobody you can see was deployed this month. Try another month.</Empty>
      ) : visible.length === 0 ? (
        <Empty title="No workers match these filters">Clear a filter, or pick another month.</Empty>
      ) : (
        <div
          aria-busy={stale || undefined}
          className={cx("relative overflow-hidden rounded-xl border bg-card shadow-xs transition-opacity duration-150 ease-out", stale && "opacity-60")}
        >
          {SPRITE}
          <div
            ref={scroller}
            className="relative max-h-[70vh] scroll-pt-12 scroll-pl-[88px] overflow-auto sm:scroll-pl-[288px]"
            onMouseOver={(e) => {
              const b = cellOf(e.target);
              if (b) show(b);
              else if (hover) setHover(null);
            }}
            onMouseLeave={() => setHover(null)}
            onFocus={(e) => {
              const b = cellOf(e.target);
              if (!b) return;
              if (active.current && active.current !== b) active.current.tabIndex = -1;
              b.tabIndex = 0;
              active.current = b;
              show(b);
            }}
            onBlur={() => setHover(null)}
            onKeyDown={onKeyDown}
            onClick={(e) => {
              const b = cellOf(e.target);
              const s = b && byId.get(workerOf(b))?.cells[Number(b.dataset.c)]?.s;
              if (s) {
                setHover(null);
                onOpen(s.assignment.id);
              }
            }}
          >
            {table}
          </div>
        </div>
      )}

      {/* Portalled out of the page column, so showing or moving the card never re-lays out the big table. */}
      {hover &&
        cur &&
        createPortal(<DayCard rect={hover.rect} row={hover.row} cell={cur} date={model.days[hover.c]} holiday={model.holidayNames[hover.c]} />, document.body)}
    </div>
  );
}

function DayCard({ rect, row, cell, date, holiday }: { rect: DOMRect; row: Row; cell: Cell; date: string; holiday?: string }) {
  const { world } = useStore();
  const ref = useRef<HTMLDivElement>(null);

  // Next to the cell, flipping to the other side (or below / above on narrow screens) near the viewport edges.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const gap = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.right + gap;
    let top = rect.top;
    if (left + w > vw - gap) left = rect.left - gap - w;
    if (left < gap) {
      left = Math.min(Math.max(gap, rect.left + rect.width / 2 - w / 2), vw - gap - w);
      top = rect.bottom + gap + h > vh - gap ? rect.top - gap - h : rect.bottom + gap;
    }
    el.style.left = `${Math.max(gap, left)}px`;
    el.style.top = `${Math.max(gap, Math.min(top, vh - gap - h))}px`;
  }, [rect, cell]);

  const s = cell.s;
  const at = (dt: string) => (dateOf(dt) === date ? timeOf(dt) : fmtDT(dt));
  const v = s && world.verifications[s.assignment.id];
  const devices = s ? [...new Set(s.punches.flatMap((p) => p.sources))].filter((x) => x !== "MANUAL") : [];
  const manual = s?.punches.find((p) => p.manual)?.manual;
  const kind = s && formalExtraDuty(world).get(s.assignment.id);
  const noOut = s?.status === "MISSING_OUT";

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-50 flex w-72 animate-in flex-col gap-2.5 rounded-xl border bg-popover p-3 text-[13px] text-popover-foreground shadow-md duration-150 fade-in-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[12px] text-muted-foreground">{row.w.id}</p>
          <p className="truncate font-semibold">{row.w.name}</p>
        </div>
        {s && <Tag tone={s.shift.code === "N" ? "night" : s.shift.code === "D" ? "day" : "muted"}>{s.shift.code}</Tag>}
      </div>
      <p className="text-muted-foreground">
        {fmtDate(date)}
        {holiday && <span className={STATUS.HOLIDAY.text}> · {holiday}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {cell.st && <StatusIcon status={cell.st} label className="font-medium" />}
        {s?.assignment.extraDutyId && <Tag tone="ink">Extra shift</Tag>}
        {cell.disputed && <Tag tone="alert">Disputed</Tag>}
      </div>
      {s && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t pt-2.5 tabular-nums">
          <dt className="text-muted-foreground">Shift</dt>
          <dd>
            {s.shift.name} · <span className="font-mono text-[12px]">{s.shift.start}–{s.shift.end}</span>
          </dd>
          {s.in ? (
            <>
              <dt className="text-muted-foreground">IN</dt>
              <dd className="font-mono text-[12px]">{at(s.in)}</dd>
              <dt className="text-muted-foreground">OUT</dt>
              <dd className={cx("font-mono text-[12px]", !s.out && noOut && cx("font-sans text-[13px]", STATUS.MISSING_OUT.text))}>
                {s.out ? at(s.out) : s.status === "ON_DUTY" ? <span className="font-sans text-[13px] text-primary">On duty</span> : "Not recorded"}
              </dd>
              <dt className="text-muted-foreground">Worked</dt>
              <dd>{noOut ? "No OUT punch" : fmtDur(s.netMins)}</dd>
              <dt className="text-muted-foreground">Break</dt>
              <dd>{s.breakMins ? fmtDur(s.breakMins) : "—"}</dd>
            </>
          ) : (
            <>
              <dt className="text-muted-foreground">Punches</dt>
              <dd>{s.status === "UPCOMING" ? "Shift not started" : "No punch"}</dd>
            </>
          )}
          {s.lateMins > 0 && (
            <>
              <dt className="text-muted-foreground">Late by</dt>
              <dd className={STATUS.LATE.text}>{fmtDur(s.lateMins)}</dd>
            </>
          )}
          {kind ? (
            <>
              <dt className="text-muted-foreground">Extra duty</dt>
              <dd className="text-primary">
                {noOut
                  ? `${kind === "ADDITIONAL_SHIFT" ? "Extra shift" : "Extension requested"}, no OUT punch`
                  : kind === "ADDITIONAL_SHIFT"
                    ? `${fmtDur(s.netMins)} extra shift`
                    : `+${fmtDur(s.extensionMins)} past shift end`}
              </dd>
            </>
          ) : (
            s.extensionMins > 0 && (
              <>
                <dt className="text-muted-foreground">Worked past shift</dt>
                <dd>{fmtDur(s.extensionMins)} (no extra-duty request)</dd>
              </>
            )
          )}
          {s.status !== "UPCOMING" && (
            <>
              <dt className="text-muted-foreground">Client</dt>
              <dd>{v?.client === "VERIFIED" ? "Verified" : v?.client === "DISPUTED" ? (v.resolved ? "Dispute resolved" : "Disputed") : "Not verified"}</dd>
              <dt className="text-muted-foreground">Contractor</dt>
              <dd>{v?.contractor === "CONFIRMED" ? "Confirmed" : v?.contractor === "CORRECTION_REQUESTED" ? "Correction requested" : "Not confirmed"}</dd>
            </>
          )}
          {devices.length > 0 && (
            <>
              <dt className="text-muted-foreground">Devices</dt>
              <dd className="font-mono text-[12px]">{devices.join(", ")}</dd>
            </>
          )}
        </dl>
      )}
      {manual && (
        <p className="rounded-lg bg-muted px-2.5 py-1.5 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">Manual punch:</span> {manual.reason} · approved by {manual.approver}
        </p>
      )}
      {cell.others.map((o) => (
        <p key={o.assignment.id} className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Also {o.shift.code} {o.shift.start}–{o.shift.end}
          <StatusIcon status={statusOf(o)} label />
        </p>
      ))}
      {s && <p className="text-[12px] text-muted-foreground">Click or press Enter for the full shift.</p>}
    </div>
  );
}
