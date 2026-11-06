import { shiftWindow, toMin } from "./time.ts";
import type {
  DateStr,
  DateTimeStr,
  PunchSource,
  RawPunch,
  ShiftAssignment,
  ShiftTemplate,
  Verification,
  World,
} from "./types.ts";

/** Punches from different sources within this many minutes are the same physical punch. */
export const MERGE_WINDOW_MINS = 2;
/** How far before shift start a punch can still belong to that shift. */
const LEAD_MINS = 180;
/** How far after shift end a punch can still belong to it (covers a full back-to-back extension). */
const TRAIL_MINS = 14 * 60;
/** Gap kept before the worker's next shift so its early IN is not stolen by the previous shift. */
const NEXT_GAP_MINS = 120;

export interface ReconciledPunch {
  at: DateTimeStr;
  sources: PunchSource[];
  eventIds: string[];
  manual?: RawPunch["manual"];
}

export type SessionStatus = "UPCOMING" | "ABSENT" | "ON_DUTY" | "PRESENT" | "MISSING_OUT";

export interface Interval {
  from: DateTimeStr;
  to: DateTimeStr;
}

export interface Session {
  assignment: ShiftAssignment;
  shift: ShiftTemplate;
  sched: Interval;
  punches: ReconciledPunch[];
  in: DateTimeStr | null;
  out: DateTimeStr | null;
  breaks: Interval[];
  status: SessionStatus;
  /** Minutes; computed up to `now` while on duty. */
  breakMins: number;
  netMins: number;
  regularMins: number;
  extensionMins: number;
  preShiftMins: number;
  lateMins: number;
  earlyOutMins: number;
  duplicatesDropped: number;
  hasManual: boolean;
}

export const isPresent = (s: Session) =>
  s.status === "ON_DUTY" || s.status === "PRESENT" || s.status === "MISSING_OUT";

/** A worker's day in one word, shared by the attendance register, the shift board and their legends. */
export type DayStatus = "PRESENT" | "LATE" | "MISSING_OUT" | "ABSENT" | "ON_DUTY" | "UPCOMING" | "REST" | "HOLIDAY";

/** The status of one rostered shift. Late wins over present and on duty, because it needs attention. */
export function statusOf(s: Session): DayStatus {
  switch (s.status) {
    case "UPCOMING":
      return "UPCOMING";
    case "ABSENT":
      return "ABSENT";
    case "MISSING_OUT":
      return "MISSING_OUT";
    case "ON_DUTY":
      return s.lateMins > 0 ? "LATE" : "ON_DUTY";
    case "PRESENT":
      return s.lateMins > 0 ? "LATE" : "PRESENT";
  }
}

/** Worked but not yet verified by the client; a disputed shift still counts. One rule for the dashboard and Attendance. */
export const awaitingVerification = (s: Session, v: Pick<Verification, "client"> | undefined) => isPresent(s) && v?.client !== "VERIFIED";

/**
 * A regular shift that has begun is locked in the roster: it may already carry punches, and replacing it
 * would orphan them. Extra-duty shifts are managed on their own screen and are never locked here.
 */
export const shiftStarted = (a: ShiftAssignment, shift: ShiftTemplate, now: DateTimeStr) =>
  !a.extraDutyId && toMin(shiftWindow(a.date, shift.start, shift.end).start) <= toMin(now);

/**
 * Idempotent ingestion + multi-source reconciliation.
 * 1. Exact repeats (same source + event id) are dropped.
 * 2. Punches from different sources within MERGE_WINDOW_MINS collapse into one.
 * Raw events are never edited; the result is a derived view.
 */
export function reconcile(punches: RawPunch[]): { punches: ReconciledPunch[]; dropped: number } {
  const seen = new Set<string>();
  const unique: RawPunch[] = [];
  for (const p of punches) {
    const k = `${p.source}|${p.eventId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(p);
  }
  unique.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const out: ReconciledPunch[] = [];
  for (const p of unique) {
    const last = out[out.length - 1];
    if (
      last &&
      !last.sources.includes(p.source) &&
      toMin(p.at) - toMin(last.at) <= MERGE_WINDOW_MINS
    ) {
      last.sources.push(p.source);
      last.eventIds.push(p.eventId);
      last.manual ??= p.manual;
      continue;
    }
    out.push({ at: p.at, sources: [p.source], eventIds: [p.eventId], manual: p.manual });
  }
  return { punches: out, dropped: punches.length - unique.length + (unique.length - out.length) };
}

function overlap(a: [number, number], b: [number, number]): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

export function buildSession(
  assignment: ShiftAssignment,
  shift: ShiftTemplate,
  raw: RawPunch[],
  now: DateTimeStr,
  windowEnd: number,
  graceMins: number,
): Session {
  const sched = (() => {
    const w = shiftWindow(assignment.date, shift.start, shift.end);
    return { from: w.start, to: w.end };
  })();
  const { punches, dropped } = reconcile(raw);
  const s = toMin(sched.from);
  const e = toMin(sched.to);
  const nowM = toMin(now);
  const open = nowM < windowEnd;

  let inAt: DateTimeStr | null = null;
  let outAt: DateTimeStr | null = null;
  const breaks: Interval[] = [];
  let status: SessionStatus;

  if (punches.length === 0) {
    status = nowM < s + graceMins ? "UPCOMING" : "ABSENT";
  } else {
    inAt = punches[0].at;
    const rest = punches.slice(1);
    const odd = punches.length % 2 === 1;
    // Odd count: still on duty, or the OUT was never recorded once the window closed.
    // Even count before shift end: the last punch is a break that is still running, not an OUT.
    const stillOpen = open && (odd ? nowM < e + TRAIL_MINS : nowM < e);
    const middle = odd || stillOpen ? rest : rest.slice(0, -1);
    if (!odd && !stillOpen) outAt = punches[punches.length - 1].at;
    for (let i = 0; i + 1 < middle.length; i += 2) breaks.push({ from: middle[i].at, to: middle[i + 1].at });
    if (middle.length % 2 === 1 && stillOpen) breaks.push({ from: middle[middle.length - 1].at, to: now });
    status = outAt ? "PRESENT" : stillOpen ? "ON_DUTY" : "MISSING_OUT";
  }

  const inM = inAt ? toMin(inAt) : 0;
  const endM = outAt ? toMin(outAt) : status === "ON_DUTY" ? Math.max(inM, nowM) : inM;
  const work: [number, number] = [inM, endM];
  const brk = breaks.map((b) => [toMin(b.from), toMin(b.to)] as [number, number]);
  // Only break time inside the worked span counts: a missing-OUT shift has no known span, so it can never go negative.
  const within = brk.map((b) => [Math.max(b[0], work[0]), Math.min(b[1], work[1])] as [number, number]).filter((b) => b[1] > b[0]);
  const minus = (range: [number, number]) =>
    overlap(work, range) - within.reduce((sum, b) => sum + overlap(b, range), 0);

  const breakMins = brk.reduce((sum, b) => sum + (b[1] - b[0]), 0);
  const late = inAt ? inM - s : 0;
  const early = outAt ? e - endM : 0;
  // A few minutes past the end (queue at the face device) is not an extension; same grace as lateness.
  const ext = inAt ? minus([e, Number.MAX_SAFE_INTEGER]) : 0;

  return {
    assignment,
    shift,
    sched,
    punches,
    in: inAt,
    out: outAt,
    breaks,
    status,
    breakMins,
    // Unknown (0) for a missing OUT; screens say "no OUT punch" rather than show a duration.
    netMins: inAt ? endM - inM - within.reduce((sum, b) => sum + (b[1] - b[0]), 0) : 0,
    regularMins: inAt ? minus([s, e]) : 0,
    extensionMins: ext > graceMins ? ext : 0,
    preShiftMins: inAt ? minus([Number.MIN_SAFE_INTEGER, s]) : 0,
    lateMins: late > graceMins ? late : 0,
    earlyOutMins: early > graceMins ? early : 0,
    duplicatesDropped: dropped,
    hasManual: punches.some((p) => p.manual),
  };
}

export interface AttendanceIndex {
  byAssignment: Map<string, Session>;
  byDate: Map<DateStr, Session[]>;
  byWorker: Map<string, Session[]>;
}

/** Derives every session from roster + raw punches. Each punch belongs to at most one shift window. */
export function buildAttendance(world: Pick<World, "shifts" | "punches" | "assignments" | "now" | "policy">): AttendanceIndex {
  const shiftById = new Map(world.shifts.map((s) => [s.id, s]));
  const punchesByWorker = new Map<string, RawPunch[]>();
  for (const p of world.punches) {
    const list = punchesByWorker.get(p.workerId);
    if (list) list.push(p);
    else punchesByWorker.set(p.workerId, [p]);
  }
  const assignmentsByWorker = new Map<string, { a: ShiftAssignment; start: number; end: number }[]>();
  for (const a of world.assignments) {
    const shift = shiftById.get(a.shiftId);
    if (!shift) continue;
    const w = shiftWindow(a.date, shift.start, shift.end);
    const row = { a, start: toMin(w.start), end: toMin(w.end) };
    const list = assignmentsByWorker.get(a.workerId);
    if (list) list.push(row);
    else assignmentsByWorker.set(a.workerId, [row]);
  }

  const index: AttendanceIndex = { byAssignment: new Map(), byDate: new Map(), byWorker: new Map() };
  for (const [workerId, rows] of assignmentsByWorker) {
    rows.sort((x, y) => x.start - y.start);
    const punches = (punchesByWorker.get(workerId) ?? []).slice().sort((x, y) => (x.at < y.at ? -1 : 1));
    let cursor = 0;
    const sessions: Session[] = [];
    rows.forEach((row, i) => {
      const next = rows[i + 1];
      const lo = row.start - LEAD_MINS;
      const hi = Math.min(row.end + TRAIL_MINS, next ? next.start - NEXT_GAP_MINS : Number.MAX_SAFE_INTEGER);
      while (cursor < punches.length && toMin(punches[cursor].at) < lo) cursor++;
      const mine: RawPunch[] = [];
      while (cursor < punches.length && toMin(punches[cursor].at) < hi) mine.push(punches[cursor++]);
      const session = buildSession(row.a, shiftById.get(row.a.shiftId)!, mine, world.now, hi, world.policy.lateGraceMins);
      sessions.push(session);
      index.byAssignment.set(row.a.id, session);
      const day = index.byDate.get(row.a.date);
      if (day) day.push(session);
      else index.byDate.set(row.a.date, [session]);
    });
    index.byWorker.set(workerId, sessions);
  }
  return index;
}

/** Actual worked interval of an extra duty, derived from punches (never from the plan). */
export function extraActual(
  kind: "EXTENSION" | "ADDITIONAL_SHIFT",
  original: Session | undefined,
  extra: Session | undefined,
  now: DateTimeStr,
): { from: DateTimeStr | null; to: DateTimeStr | null; mins: number; running: boolean } {
  if (kind === "EXTENSION") {
    if (!original || !original.in || original.extensionMins <= 0)
      return { from: null, to: null, mins: 0, running: false };
    const running = original.status === "ON_DUTY";
    return {
      from: original.sched.to,
      to: original.out ?? (running ? now : null),
      mins: original.extensionMins,
      running,
    };
  }
  if (!extra || !extra.in) return { from: null, to: null, mins: 0, running: false };
  const running = extra.status === "ON_DUTY";
  return { from: extra.in, to: extra.out ?? (running ? now : null), mins: extra.netMins, running };
}

export const minutesBetween = (a: DateTimeStr, b: DateTimeStr) => toMin(b) - toMin(a);
export const shiftLabel = (s: ShiftTemplate) => `${s.code} · ${s.start}–${s.end}`;
