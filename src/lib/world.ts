import type { AssignmentPeriod, DateStr, Deployment, StrengthEntry, Viewer, Worker, World } from "./types.ts";

/** Effective-dated lookup: the latest entry whose `from` is on or before the date. */
export function effective<T extends { from: DateStr }>(entries: T[], date: DateStr): T | undefined {
  let best: T | undefined;
  for (const e of entries) if (e.from <= date && (!best || e.from >= best.from)) best = e;
  return best;
}

export const assignmentOn = (w: Worker, date: DateStr): AssignmentPeriod | undefined =>
  effective(w.assignments, date);

export function deploymentKey(contractorId: string, departmentId: string) {
  return `${contractorId}:${departmentId}`;
}

export function deploymentOf(world: World, w: Worker, date: DateStr): Deployment | undefined {
  const a = assignmentOn(w, date);
  if (!a) return undefined;
  return world.deployments.find((d) => d.contractorId === a.contractorId && d.departmentId === a.departmentId);
}

export const strengthOn = (d: Deployment, date: DateStr): StrengthEntry =>
  effective(d.strengths, date) ?? { from: date, licensed: 0, approved: 0 };

export function names(world: World) {
  const contractor = new Map(world.contractors.map((c) => [c.id, c]));
  const department = new Map(world.departments.map((d) => [d.id, d]));
  const worker = new Map(world.workers.map((w) => [w.id, w]));
  const shift = new Map(world.shifts.map((s) => [s.id, s]));
  const assignment = new Map(world.assignments.map((a) => [a.id, a]));
  const deploymentLabel = (d: Deployment) =>
    `${contractor.get(d.contractorId)?.name ?? "?"} · ${department.get(d.departmentId)?.name ?? "?"}`;
  return { contractor, department, worker, shift, assignment, deploymentLabel };
}
export type Names = ReturnType<typeof names>;

/**
 * The date a worker is scoped by on `today`: today, or their first deployment date when they join later
 * (a future joiner has no assignment today yet, but already belongs to their first contractor).
 */
export function scopeDate(w: Worker, today: DateStr): DateStr {
  const first = w.assignments.reduce((m, a) => (a.from < m ? a.from : m), w.assignments[0]?.from ?? today);
  return first > today ? first : today;
}

/** Contractor scoping: a contractor user only ever sees their own workforce. */
export function canSeeWorker(viewer: Viewer, w: Worker, date: DateStr): boolean {
  if (viewer.role !== "CONTRACTOR_ADMIN") return true;
  return assignmentOn(w, date)?.contractorId === viewer.contractorId;
}

export function canSeeDeployment(viewer: Viewer, d: Deployment): boolean {
  return viewer.role !== "CONTRACTOR_ADMIN" || d.contractorId === viewer.contractorId;
}

export const isHoliday = (world: World, date: DateStr) => world.holidays.find((h) => h.date === date);
