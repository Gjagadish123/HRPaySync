"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button as UiButton } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { exceptions, scopedSessions } from "@/components/scope";
import { SessionDetail } from "@/components/session-detail";
import { STATUS, STATUS_ORDER, StatusIcon, StatusLegend, statusOf, type DayStatus } from "@/components/status";
import { useStore } from "@/components/store";
import { Button, Empty, PageHeader, Sheet, Tag, buttonClass, cx, useToast } from "@/components/app-ui";
import { isPresent, type Session } from "@/lib/attendance";
import type { Deployment, ShiftTemplate, StrengthEntry } from "@/lib/types";
import { fmtDur, timeOf, toMin } from "@/lib/time";
import { canSeeDeployment, isHoliday, strengthOn } from "@/lib/world";
import { formalExtraDuty } from "@/lib/workflow";

/** Minimum slot card width and the board gap (gap-4), used to measure how many columns fit. */
const COL = 184;
const GAP = 16;

type BoardStatus = Exclude<DayStatus, "REST" | "HOLIDAY">;
/** The statuses a shift can have on today's board, in the shared legend order. */
const BOARD: BoardStatus[] = STATUS_ORDER.filter((s): s is BoardStatus => s !== "REST" && s !== "HOLIDAY");

const CHIP = "relative inline-flex items-center justify-center rounded-md border font-mono text-[11px] leading-none font-medium tabular-nums";
/** Chip tint per status. The ID is the status hue darkened, so 11px text stays readable on its tint. */
const TONE: Record<BoardStatus, string> = {
  PRESENT: "border-status-present/35 bg-status-present/12 text-[color:color-mix(in_oklch,var(--status-present)_68%,black)]",
  LATE: "border-status-late/50 bg-status-late/16 text-[color:color-mix(in_oklch,var(--status-late)_60%,black)]",
  MISSING_OUT: "border-status-missing/45 bg-status-missing/14 text-[color:color-mix(in_oklch,var(--status-missing)_66%,black)]",
  ABSENT: "border-[1.5px] border-status-absent/70 bg-card text-[color:color-mix(in_oklch,var(--status-absent)_80%,black)]",
  ON_DUTY: "border-status-onduty/30 bg-status-onduty/10 text-[color:color-mix(in_oklch,var(--status-onduty)_80%,black)]",
  UPCOMING: "border-[1.5px] border-dashed border-muted-foreground/45 bg-card text-muted-foreground",
};
/** Missing OUT keeps the shape cue from the design system: the right half of the tint is washed out. */
const HALF: CSSProperties = { backgroundImage: "linear-gradient(to right, transparent 50%, var(--card) 50%)" };
const NEEDS = "ring-[1.5px] ring-foreground/55 ring-offset-1 ring-offset-card";
const LINKED = "z-10 outline-2 outline-offset-2 outline-primary";
const BAR: Record<BoardStatus, string> = { ...Object.fromEntries(BOARD.map((s) => [s, STATUS[s].solid])), UPCOMING: "bg-muted-foreground/30" } as Record<BoardStatus, string>;
const PILL =
  "inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[13px] font-medium text-foreground transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45";

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;

/** Chip markers, also drawn by the legend so the two can never disagree. */
function Markers({ late, extra, disputed }: { late?: boolean; extra?: boolean; disputed?: boolean }) {
  return (
    <>
      {late && (
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <span className="absolute top-0 left-0 size-0 border-t-[7px] border-r-[7px] border-t-status-late border-r-transparent" />
        </span>
      )}
      {disputed && <span aria-hidden className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive ring-2 ring-card" />}
      {extra && (
        <span aria-hidden className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full bg-foreground text-background ring-2 ring-card">
          <svg viewBox="0 0 8 8" className="size-2">
            <path d="M4 1.25v5.5M1.25 4h5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      )}
    </>
  );
}

interface Chip {
  s: Session;
  st: BoardStatus;
  name: string;
  /** Lower-cased ID, name and device number, for the worker search. */
  hay: string;
}

interface Lane {
  key: string;
  label: string;
  codes: ShiftTemplate[];
  present: number;
  list: Chip[];
}

interface Column {
  d: Deployment;
  strength: StrengthEntry;
  present: number;
  mix: Record<BoardStatus, number>;
  lanes: Lane[];
}

interface Group {
  contractorId: string;
  name: string;
  present: number;
  approved: number;
  columns: Column[];
}

function TCard({
  c,
  extra,
  tagged,
  linked,
  found,
  dim,
  verified,
  disputed,
  onOpen,
}: {
  c: Chip;
  extra: boolean;
  tagged: boolean;
  linked: boolean;
  found: boolean;
  dim: boolean;
  verified: boolean;
  disputed: boolean;
  onOpen: () => void;
}) {
  const { s, st } = c;
  const state = [
    st === "LATE" ? `Late by ${fmtDur(s.lateMins)}` : STATUS[st].label,
    st === "LATE" || st === "PRESENT" ? (s.status === "ON_DUTY" ? "on duty" : "shift completed") : s.lateMins > 0 ? `late by ${fmtDur(s.lateMins)}` : "",
    s.in ? `IN ${timeOf(s.in)}` : "",
    s.out ? `OUT ${timeOf(s.out)}` : "",
    extra ? "extra duty" : "",
    verified ? "verified" : "",
    disputed ? "disputed" : "",
    tagged ? "needs action" : "",
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${s.assignment.workerId} ${c.name} · ${s.shift.code} shift · ${state.join(" · ")}`}
      aria-label={`${s.assignment.workerId} ${c.name}, ${s.shift.code} shift, ${state.join(", ")}`}
      data-assignment={s.assignment.id}
      style={st === "MISSING_OUT" ? HALF : undefined}
      className={cx(
        CHIP,
        "h-6 transition-[opacity,translate,box-shadow] duration-150 ease-out hover:shadow-sm motion-safe:hover:-translate-y-px focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        TONE[st],
        tagged && NEEDS,
        (linked || found) && LINKED,
        dim && "opacity-25",
      )}
    >
      {s.assignment.workerId.slice(-3)}
      <Markers late={st === "LATE"} extra={extra} disputed={disputed} />
    </button>
  );
}

/** Thin stacked bar of today's shift statuses, with the same counts as text for assistive tech. */
function MixBar({ mix }: { mix: Record<BoardStatus, number> }) {
  const parts = BOARD.filter((st) => mix[st] > 0);
  const total = parts.reduce((t, st) => t + mix[st], 0);
  const summary = total ? `${plural(total, "shift")} today: ${parts.map((st) => `${mix[st]} ${lower(STATUS[st].label)}`).join(", ")}` : "No shifts today";
  return (
    <div role="img" aria-label={summary} title={summary} className="flex h-1.5 gap-px overflow-hidden rounded-full bg-secondary">
      {parts.map((st) => (
        <span key={st} className={cx("h-full basis-0 transition-[flex-grow] duration-300 ease-out", BAR[st])} style={{ flexGrow: mix[st] }} />
      ))}
    </div>
  );
}

export function BoardView() {
  const { world, idx, n, viewer } = useStore();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<Set<BoardStatus>>(() => new Set());
  const [contractor, setContractor] = useState("");
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const boardRef = useRef<HTMLElement>(null);
  const [cols, setCols] = useState(4);
  const ids = useId();

  // Board columns from the measured width, so contractor groups can span exactly their deployments.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCols(Math.max(1, Math.floor((e.contentRect.width + GAP) / (COL + GAP)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const today = world.today;
  const sessions = useMemo(() => scopedSessions(world, idx, n, viewer, today), [world, idx, n, viewer, today]);
  const ex = useMemo(() => exceptions(world, idx, n, viewer), [world, idx, n, viewer]);
  const sel = Math.min(cursor, Math.max(0, ex.length - 1));
  const tagged = useMemo(() => new Set(ex.flatMap((e) => e.assignmentIds)), [ex]);
  const activeIds = useMemo(() => new Set(ex[sel]?.assignmentIds ?? []), [ex, sel]);
  const onExtra = useMemo(() => formalExtraDuty(world), [world]);

  // Deployments grouped under their contractor, in the client's workbook order.
  const groups = useMemo(() => {
    const byDep = new Map<string, Session[]>();
    for (const { session, deploymentId } of sessions) {
      const list = byDep.get(deploymentId);
      if (list) list.push(session);
      else byDep.set(deploymentId, [session]);
    }
    const out: Group[] = [];
    for (const d of world.deployments) {
      if (!canSeeDeployment(viewer, d)) continue;
      const mine = [...(byDep.get(d.id) ?? [])].sort((a, b) => a.assignment.workerId.localeCompare(b.assignment.workerId));
      const chips: Chip[] = mine.map((s) => {
        const w = n.worker.get(s.assignment.workerId);
        return { s, st: statusOf(s) as BoardStatus, name: w?.name ?? "", hay: `${s.assignment.workerId} ${w?.name ?? ""} ${w?.deviceId ?? ""}`.toLowerCase() };
      });
      const mix = Object.fromEntries(BOARD.map((st) => [st, 0])) as Record<BoardStatus, number>;
      for (const c of chips) mix[c.st]++;
      // A shift that crosses midnight is a night shift; everything else shares the day lane.
      const lane = (key: string, label: string, list: Chip[]): Lane => ({
        key,
        label,
        list,
        present: list.filter((c) => isPresent(c.s)).length,
        codes: [...new Map(list.map((c) => [c.s.shift.id, c.s.shift])).values()].sort((a, b) => a.code.localeCompare(b.code)),
      });
      const night = (c: Chip) => c.s.shift.end < c.s.shift.start;
      const col: Column = {
        d,
        strength: strengthOn(d, today),
        mix,
        present: new Set(mine.filter(isPresent).map((s) => s.assignment.workerId)).size,
        lanes: [lane("day", "Day & general", chips.filter((c) => !night(c))), lane("night", "Night", chips.filter(night))].filter((l) => l.list.length),
      };
      const g = out.find((x) => x.contractorId === d.contractorId);
      if (g) g.columns.push(col);
      else out.push({ contractorId: d.contractorId, name: n.contractor.get(d.contractorId)?.name ?? d.contractorId, present: 0, approved: 0, columns: [col] });
    }
    for (const g of out) {
      g.present = g.columns.reduce((t, c) => t + c.present, 0);
      g.approved = g.columns.reduce((t, c) => t + c.strength.approved, 0);
    }
    // Largest contractor first so its columns lead the board; ties keep workbook order.
    return out.map((g, i) => ({ g, i })).sort((a, b) => b.g.columns.length - a.g.columns.length || a.i - b.i).map((x) => x.g);
  }, [world.deployments, viewer, sessions, today, n]);

  // A contractor that is no longer visible (the role changed) falls back to all.
  const cf = groups.some((g) => g.contractorId === contractor) ? contractor : "";
  const shown = useMemo(() => (cf ? groups.filter((g) => g.contractorId === cf) : groups), [groups, cf]);
  const q = query.trim().toLowerCase();
  const filtering = picked.size > 0 || q !== "";

  const counts = useMemo(() => {
    const mix = Object.fromEntries(BOARD.map((st) => [st, 0])) as Record<BoardStatus, number>;
    for (const g of shown) for (const col of g.columns) for (const st of BOARD) mix[st] += col.mix[st];
    return { mix, total: BOARD.reduce((t, st) => t + mix[st], 0) };
  }, [shown]);

  /** Assignment ids that pass the status pills and the search; null when neither is set. */
  const hits = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!picked.size && !term) return null;
    const set = new Set<string>();
    for (const g of shown)
      for (const col of g.columns)
        for (const l of col.lanes)
          for (const c of l.list) if ((!picked.size || picked.has(c.st)) && (!term || c.hay.includes(term))) set.add(c.s.assignment.id);
    return set;
  }, [shown, picked, query]);
  const matched = hits ? hits.size : counts.total;

  const totals = useMemo(() => {
    const upcoming = sessions.map((s) => s.session).filter((s) => s.status === "UPCOMING");
    const next = upcoming.map((s) => s.sched.from).sort()[0];
    return {
      present: groups.reduce((t, g) => t + g.present, 0),
      approved: groups.reduce((t, g) => t + g.approved, 0),
      next,
      nextCount: next ? upcoming.filter((s) => s.sched.from === next).length : 0,
    };
  }, [groups, sessions]);

  const toggle = (st: BoardStatus) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(st)) next.add(st);
      return next;
    });
  const clearAll = () => {
    setPicked(new Set());
    setQuery("");
    setContractor("");
  };

  const move = (to: number) => {
    const next = Math.max(0, Math.min(to, ex.length - 1));
    setCursor(next);
    requestAnimationFrame(() => {
      const li = listRef.current?.children[next] as HTMLElement | undefined;
      li?.scrollIntoView({ block: "nearest" });
      li?.querySelector<HTMLElement>("[data-item]")?.focus({ preventScroll: true });
      // On the wide layout the queue is sticky, so bring the outlined cards into view beside it.
      const id = ex[next]?.assignmentIds[0];
      const card = id && window.matchMedia("(min-width: 1280px)").matches ? boardRef.current?.querySelector(`[data-assignment="${CSS.escape(id)}"]`) : null;
      card?.scrollIntoView({ block: "nearest" });
    });
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea, [role=dialog], [role=menu], [role=listbox]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j") move(sel + 1);
      else if (e.key === "k") move(sel - 1);
      // Only on a queue item itself, so Enter still presses the queue's other buttons. Enter on the selected item
      // opens it; on any other item the button's own click selects it.
      else if (e.key === "Enter") {
        const item = t.closest<HTMLElement>("[data-item]");
        const i = item ? Number(item.dataset.item) : -1;
        if (i === sel && ex[i]) {
          e.preventDefault();
          router.push(ex[i].href);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const holiday = isHoliday(world, today);
  const openSession = open ? idx.byAssignment.get(open) : undefined;
  const shortBy = totals.approved - totals.present;
  const active = ex[sel];
  const onBoard = BOARD.filter((st) => counts.mix[st] > 0);
  const swatch = cx(CHIP, "h-5 w-8 shrink-0 border-border bg-card");

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Shift board"
        description={
          <>
            {holiday ? `Holiday roster (${holiday.name}). ` : ""}
            <span className="font-medium text-foreground">
              {totals.present} of {totals.approved}
            </span>{" "}
            approved workers on site,{" "}
            {shortBy > 0 ? `${shortBy} short of approved strength` : shortBy < 0 ? `${-shortBy} above approved strength` : "at approved strength"}.{" "}
            {totals.next && toMin(totals.next) > toMin(world.now) ? `Next shift starts at ${timeOf(totals.next)} with ${totals.nextCount} rostered. ` : ""}
            Each worker counts once, on their shift start date.
          </>
        }
      />

      <section aria-labelledby={`${ids}-today`} className="mb-6 rounded-xl border bg-card shadow-xs">
        <div className="flex flex-col gap-3 p-4">
          <h2 id={`${ids}-today`} className="text-sm font-semibold">
            Today&apos;s shifts
          </h2>
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={!picked.size}
              onClick={() => setPicked(new Set())}
              className={cx(PILL, picked.size ? "bg-card hover:bg-muted" : "border-foreground/20 bg-secondary")}
            >
              All
              <span className="font-semibold tabular-nums">{counts.total}</span>
            </button>
            {BOARD.map((st) => {
              const on = picked.has(st);
              return (
                <button
                  key={st}
                  type="button"
                  aria-pressed={on}
                  disabled={!counts.mix[st] && !on}
                  onClick={() => toggle(st)}
                  className={cx(PILL, on ? cx(STATUS[st].soft, "border-foreground/20") : "bg-card hover:bg-muted")}
                >
                  <StatusIcon status={st} label />
                  <span className="font-semibold tabular-nums">{counts.mix[st]}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {groups.length > 1 && (
              <div className="relative sm:w-60">
                <label htmlFor={`${ids}-contractor`} className="sr-only">
                  Contractor
                </label>
                <select id={`${ids}-contractor`} className="field" value={cf} onChange={(e) => setContractor(e.target.value)}>
                  <option value="">All contractors</option>
                  {groups.map((g) => (
                    <option key={g.contractorId} value={g.contractorId}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="relative sm:w-72">
              <label htmlFor={`${ids}-find`} className="sr-only">
                Find a worker
              </label>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id={`${ids}-find`}
                type="search"
                className="field pl-9"
                placeholder="Find by ID, name or device no."
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 sm:ml-auto">
              <p aria-live="polite" className="text-[13px] text-muted-foreground">
                {!filtering
                  ? `${plural(counts.total, "shift")} on the board`
                  : matched === 0
                    ? `No shift matches${q ? ` “${query.trim()}”` : ""}${picked.size ? " with the chosen statuses" : ""}`
                    : `${matched} of ${plural(counts.total, "shift")} match`}
              </p>
              {(filtering || cf) && (
                <Button kind="quiet" size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="border-t px-4 py-3">
          <StatusLegend
            statuses={onBoard}
            extra={
              <>
                <li className="flex items-center gap-2">
                  <span className={swatch}>
                    <Markers extra />
                  </span>
                  Extra duty
                </li>
                <li className="flex items-center gap-2">
                  <span className={swatch}>
                    <Markers disputed />
                  </span>
                  Disputed
                </li>
                <li className="flex items-center gap-2">
                  <span className={cx(swatch, NEEDS)} />
                  Needs action
                </li>
                <li className="flex items-center gap-2">
                  <span className={cx(swatch, LINKED, "z-0")} />
                  Selected item or search match
                </li>
              </>
            }
          />
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section
          ref={boardRef}
          aria-label="Shift board"
          className="grid content-start gap-x-4 gap-y-8 [grid-auto-flow:row_dense]"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {shown.map(({ contractorId, name, present: gp, approved: ga, columns }, gi) => {
            const span = Math.min(columns.length, cols);
            return (
              <div key={contractorId} className="flex min-w-0 flex-col gap-3" style={{ gridColumn: `span ${span}` }}>
                <h2 className="flex items-baseline justify-between gap-3 border-b pb-2 text-sm">
                  <span className="min-w-0 font-semibold text-pretty">{name}</span>
                  <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                    {gp} / {ga} present
                  </span>
                </h2>
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}>
                  {columns.map(({ d, strength, present, mix, lanes }, ci) => {
                    const short = strength.approved - present;
                    const dept = n.department.get(d.departmentId)?.name ?? d.departmentId;
                    const rostered = BOARD.reduce((t, st) => t + mix[st], 0);
                    return (
                      <article
                        key={d.id}
                        aria-label={n.deploymentLabel(d)}
                        className="slot-in flex min-w-0 flex-col rounded-xl border bg-card shadow-xs"
                        style={{ animationDelay: `${(gi * 2 + ci) * 45}ms` }}
                      >
                        <div className="flex flex-col gap-3 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="min-w-0 pt-px text-sm leading-snug font-semibold text-balance" title={dept}>
                              {dept}
                            </h3>
                            <Tag tone={short > 0 ? "alert" : short < 0 ? "muted" : "ok"} className="shrink-0">
                              {short > 0 ? `Short ${short}` : short < 0 ? `Over ${-short}` : "At strength"}
                            </Tag>
                          </div>
                          <p className="flex items-baseline gap-1.5">
                            <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{present}</span>
                            <span className="text-muted-foreground tabular-nums">/ {strength.approved}</span>
                            <span className="text-[13px] text-muted-foreground">present</span>
                          </p>
                          <div className="flex flex-col gap-2">
                            <MixBar mix={mix} />
                            <p className="text-xs text-muted-foreground">
                              {plural(rostered, "shift")} rostered · licence {strength.licensed}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-3 border-t px-4 pt-3 pb-4">
                          {lanes.length === 0 && <p className="text-[13px] text-muted-foreground">No one rostered today.</p>}
                          {lanes.map((lane) => (
                            <div key={lane.key} className="flex flex-col gap-2">
                              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <h4 className="flex min-w-0 items-center gap-1.5">
                                  <span className="truncate font-medium text-foreground">{lane.label}</span>
                                  {lane.codes.map((sh) => (
                                    <abbr
                                      key={sh.id}
                                      title={`${sh.name}, ${sh.start}–${sh.end}`}
                                      className="rounded-sm bg-secondary px-1 py-0.5 font-mono text-[11px] leading-none text-secondary-foreground no-underline"
                                    >
                                      {sh.code}
                                    </abbr>
                                  ))}
                                </h4>
                                <span className="shrink-0 tabular-nums">
                                  {lane.present}/{lane.list.length}
                                  <span className="sr-only"> present</span>
                                </span>
                              </div>
                              <div className="grid grid-cols-[repeat(auto-fill,minmax(38px,1fr))] gap-1.5">
                                {lane.list.map((c) => {
                                  const id = c.s.assignment.id;
                                  const v = world.verifications[id];
                                  const hit = !!hits?.has(id);
                                  return (
                                    <TCard
                                      key={id}
                                      c={c}
                                      extra={onExtra.has(id)}
                                      tagged={tagged.has(id)}
                                      linked={activeIds.has(id)}
                                      found={hit && q !== ""}
                                      dim={filtering && !hit}
                                      verified={v?.client === "VERIFIED"}
                                      disputed={v?.client === "DISPUTED" && !v.resolved}
                                      onOpen={() => setOpen(id)}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {groups.length === 0 && (
            <div className="col-span-full">
              <Empty title="No deployments are visible for this role." />
            </div>
          )}
        </section>

        <aside aria-label="Needs action" data-queue className="flex flex-col gap-3 max-xl:order-first xl:sticky xl:top-20 xl:self-start">
          <Card className="gap-0 py-0 shadow-xs">
            <CardHeader className="items-center border-b pt-4">
              <CardTitle className="font-semibold">
                <h2 className="flex items-center gap-2">
                  Needs action
                  <Tag tone={ex.length ? "alert" : "muted"}>{ex.length}</Tag>
                </h2>
              </CardTitle>
              {ex.length > 1 && (
                <CardAction className="flex items-center gap-1 self-center xl:hidden">
                  <UiButton type="button" variant="outline" size="icon-sm" aria-label="Previous item" disabled={sel === 0} onClick={() => move(sel - 1)}>
                    <ChevronLeft />
                  </UiButton>
                  <span className="min-w-12 text-center text-xs text-muted-foreground tabular-nums">
                    {sel + 1} of {ex.length}
                  </span>
                  <UiButton type="button" variant="outline" size="icon-sm" aria-label="Next item" disabled={sel >= ex.length - 1} onClick={() => move(sel + 1)}>
                    <ChevronRight />
                  </UiButton>
                </CardAction>
              )}
            </CardHeader>
            {ex.length > 1 && (
              <p className="flex items-center gap-1.5 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground max-xl:hidden">
                <KbdGroup>
                  <Kbd>J</Kbd>
                  <Kbd>K</Kbd>
                </KbdGroup>
                to step through ·
                <Kbd>Enter</Kbd>
                to open
              </p>
            )}
            {ex.length === 0 ? (
              <p className="px-4 py-6 text-muted-foreground">Nothing waiting. Every replacement, extension and punch is in order.</p>
            ) : (
              <ol ref={listRef} className="xl:max-h-[70vh] xl:overflow-y-auto">
                {ex.map((e, i) => {
                  const isActive = i === sel;
                  const alert = e.severity === "alert";
                  return (
                    <li key={e.id} className={cx("border-b last:border-b-0", isActive ? "bg-accent/50" : "max-xl:hidden")}>
                      <button
                        type="button"
                        data-item={i}
                        onClick={() => setCursor(i)}
                        aria-expanded={isActive}
                        className={cx("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ease-out", !isActive && "hover:bg-muted/60")}
                      >
                        <span aria-hidden className={cx("mt-1.5 size-2.5 shrink-0 rounded-full ring-4", alert ? "bg-status-absent ring-status-absent/12" : "bg-status-late ring-status-late/15")} />
                        <span className="min-w-0">
                          <span className="block font-medium">
                            <span className="sr-only">{alert ? "Urgent: " : "Attention: "}</span>
                            {e.title}
                          </span>
                          {!isActive && <span className="block truncate text-[13px] text-muted-foreground">{e.detail}</span>}
                        </span>
                      </button>
                      {isActive && (
                        <div className="flex flex-col items-start gap-3 px-4 pb-4 pl-[38px]">
                          <p className="text-muted-foreground">{e.detail}</p>
                          {(() => {
                            const hit = sessions.find((x) => e.assignmentIds.includes(x.session.assignment.id));
                            const dep = hit && world.deployments.find((d) => d.id === hit.deploymentId);
                            if (!dep) return null;
                            if (cf && dep.contractorId !== cf)
                              return (
                                <p className="text-[13px] text-muted-foreground">
                                  Its card is under {n.deploymentLabel(dep)}, hidden by the contractor filter.{" "}
                                  <Button kind="quiet" size="sm" className="h-auto text-[13px]" onClick={() => setContractor("")}>
                                    Show all contractors
                                  </Button>
                                </p>
                              );
                            return <p className="text-[13px] text-muted-foreground">Outlined on the board under {n.deploymentLabel(dep)}.</p>;
                          })()}
                          <Link href={e.href} className={buttonClass("tape", "sm")}>
                            {e.action}
                            <ArrowRight size={14} aria-hidden />
                          </Link>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
          {active && ex.length > 1 && <p className="text-[13px] text-muted-foreground xl:hidden">{ex.length - 1} more waiting</p>}
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground max-xl:hidden">
            <Tag tone="muted">Rule</Tag>A reliever is counted only after a real punch arrives, never on a status change alone.
          </p>
        </aside>
      </div>

      <Sheet open={!!openSession} onClose={() => setOpen(null)} title={openSession ? `${openSession.shift.code} shift · ${openSession.assignment.workerId}` : ""}>
        {openSession && <SessionDetail session={openSession} onMessage={toast} />}
      </Sheet>
    </div>
  );
}
