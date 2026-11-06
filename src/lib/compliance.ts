import { shiftWindow, toMin, fmtDur } from "./time.ts";
import type { DateTimeStr, RuleMode, ShiftAssignment, World } from "./types.ts";

export interface RuleResult {
  rule: string;
  mode: RuleMode | "always";
  ok: boolean;
  detail: string;
}

interface Span {
  id: string;
  start: number;
  end: number;
}

function scheduledSpans(world: World, workerId: string, ignore: Set<string>): Span[] {
  const shift = new Map(world.shifts.map((s) => [s.id, s]));
  const spans: Span[] = [];
  for (const a of world.assignments) {
    if (a.workerId !== workerId || ignore.has(a.id)) continue;
    const s = shift.get(a.shiftId);
    if (!s) continue;
    const w = shiftWindow(a.date, s.start, s.end);
    spans.push({ id: a.id, start: toMin(w.start), end: toMin(w.end) });
  }
  // Planned extensions stretch the end of their original shift.
  for (const x of world.extraDuties) {
    if (x.workerId !== workerId || x.kind !== "EXTENSION" || x.status === "REJECTED") continue;
    const span = spans.find((sp) => sp.id === x.originalAssignmentId);
    if (span) span.end = Math.max(span.end, toMin(x.plannedEnd));
  }
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Evaluates a proposed piece of work against the configured policy.
 * Figures come from client configuration; nothing statutory is hardcoded here.
 * Overlap with another assignment is always a hard conflict.
 */
export function evaluate(
  world: World,
  workerId: string,
  proposal: { start: DateTimeStr; end: DateTimeStr; extendsAssignmentId?: string; ignoreAssignmentIds?: string[] },
): RuleResult[] {
  const p = world.policy;
  const ignore = new Set(proposal.ignoreAssignmentIds ?? []);
  const spans = scheduledSpans(world, workerId, ignore);
  const ps = toMin(proposal.start);
  const pe = toMin(proposal.end);
  const results: RuleResult[] = [];

  if (pe <= ps) {
    return [{ rule: "Valid time range", mode: "always", ok: false, detail: "End must be after start." }];
  }

  // Merge the proposal into its base span (extension) or add it as its own span.
  let merged: Span[];
  if (proposal.extendsAssignmentId) {
    merged = spans.map((sp) => (sp.id === proposal.extendsAssignmentId ? { ...sp, end: Math.max(sp.end, pe) } : sp));
  } else {
    merged = [...spans, { id: "proposal", start: ps, end: pe }].sort((a, b) => a.start - b.start);
  }
  const mine = merged.find((sp) => sp.id === (proposal.extendsAssignmentId ?? "proposal"))!;

  const clash = spans.find((sp) => sp.id !== proposal.extendsAssignmentId && sp.start < pe && ps < sp.end);
  results.push({
    rule: "No overlapping assignment",
    mode: "always",
    ok: !clash,
    detail: clash ? "Overlaps another rostered shift for this worker." : "No overlap with the roster.",
  });

  const continuous = mine.end - mine.start;
  if (p.maxContinuousMode !== "off") {
    results.push({
      rule: `Continuous duty ≤ ${p.maxContinuousHours}h`,
      mode: p.maxContinuousMode,
      ok: continuous <= p.maxContinuousHours * 60,
      detail: `Continuous duty would be ${fmtDur(continuous)}.`,
    });
  }

  if (p.minRestMode !== "off") {
    const i = merged.indexOf(mine);
    const prev = merged[i - 1];
    const next = merged[i + 1];
    const gaps = [prev ? mine.start - prev.end : Infinity, next ? next.start - mine.end : Infinity];
    const shortest = Math.min(...gaps);
    results.push({
      rule: `Rest ≥ ${p.minRestHours}h between duties`,
      mode: p.minRestMode,
      ok: shortest >= p.minRestHours * 60,
      detail: shortest === Infinity ? "No neighbouring duty." : `Shortest rest would be ${fmtDur(Math.max(0, shortest))}.`,
    });
  }

  if (p.maxWeeklyMode !== "off") {
    const weekStart = mine.end - 7 * 1440;
    const total = merged.reduce((sum, sp) => sum + Math.max(0, Math.min(sp.end, mine.end) - Math.max(sp.start, weekStart)), 0);
    results.push({
      rule: `Weekly hours ≤ ${p.maxWeeklyHours}h`,
      mode: p.maxWeeklyMode,
      ok: total <= p.maxWeeklyHours * 60,
      detail: `Scheduled in the 7 days to this duty: ${fmtDur(total)}.`,
    });
  }

  return results;
}

export const isBlocked = (r: RuleResult[]) => r.some((x) => !x.ok && (x.mode === "block" || x.mode === "always"));
export const hasWarnings = (r: RuleResult[]) => r.some((x) => !x.ok && x.mode === "warn");

/** Roster-level problems for one worker: overlaps and short rests between consecutive shifts. */
export function rosterConflicts(world: World, assignments: ShiftAssignment[]): Map<string, string> {
  const shift = new Map(world.shifts.map((s) => [s.id, s]));
  const byWorker = new Map<string, Span[]>();
  for (const a of assignments) {
    const s = shift.get(a.shiftId);
    if (!s) continue;
    const w = shiftWindow(a.date, s.start, s.end);
    const list = byWorker.get(a.workerId) ?? [];
    list.push({ id: a.id, start: toMin(w.start), end: toMin(w.end) });
    byWorker.set(a.workerId, list);
  }
  const issues = new Map<string, string>();
  const minRest = world.policy.minRestMode === "off" ? 0 : world.policy.minRestHours * 60;
  for (const list of byWorker.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].start - list[i - 1].end;
      if (gap < 0) issues.set(list[i].id, "Overlaps the previous shift");
      else if (gap < minRest) issues.set(list[i].id, `Only ${fmtDur(gap)} rest before this shift`);
    }
  }
  return issues;
}
