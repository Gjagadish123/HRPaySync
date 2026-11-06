import { isPresent, type AttendanceIndex, type Session } from "./attendance.ts";
import { monthDays } from "./time.ts";
import type { DateStr, Deployment, Viewer, World } from "./types.ts";
import { canSeeDeployment, deploymentOf, isHoliday, names, strengthOn } from "./world.ts";
import { replacementView } from "./workflow.ts";

/**
 * Headcount rule (pending client sign-off, SRS §16 Q4–Q5): a worker counts on the work date of the
 * shift they reported for (shift start date), once per date even with several shifts.
 */
export function presentByDeployment(world: World, idx: AttendanceIndex, date: DateStr): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const worker = new Map(world.workers.map((w) => [w.id, w]));
  for (const s of idx.byDate.get(date) ?? []) {
    if (!isPresent(s)) continue;
    const w = worker.get(s.assignment.workerId);
    const dep = w && deploymentOf(world, w, date);
    if (!dep) continue;
    const set = out.get(dep.id) ?? new Set<string>();
    set.add(w.id);
    out.set(dep.id, set);
  }
  return out;
}

export interface DailySummary {
  month: string;
  deployments: Deployment[];
  labels: { contractor: string; department: string }[];
  licensed: number[];
  approved: number[];
  days: { date: DateStr; counts: (number | null)[]; total: number | null; remarks: string; holiday?: string }[];
  monthTotals: number[];
  grandTotal: number;
}

/** The client's Daily Consolidated Manpower Summary: every calendar day, totals through the last day. */
export function dailySummary(world: World, idx: AttendanceIndex, viewer: Viewer, month: string): DailySummary {
  const n = names(world);
  const deployments = world.deployments.filter((d) => canSeeDeployment(viewer, d));
  const days = monthDays(month);
  const last = days[days.length - 1];
  const vis = (workerId: string, date: DateStr) => {
    if (viewer.role !== "CONTRACTOR_ADMIN") return true;
    const w = n.worker.get(workerId);
    return !!w && deploymentOf(world, w, date)?.contractorId === viewer.contractorId;
  };
  const rows = days.map((date) => {
    if (date > world.today) return { date, counts: deployments.map(() => null), total: null, remarks: "" };
    const present = presentByDeployment(world, idx, date);
    const counts = deployments.map((d) => present.get(d.id)?.size ?? 0);
    const remarks: string[] = [];
    const hol = isHoliday(world, date);
    if (hol) remarks.push(`Holiday: ${hol.name}`);
    else {
      const short = deployments
        .map((d, i) => ({ d, gap: strengthOn(d, date).approved - counts[i] }))
        .filter((x) => x.gap > 0)
        .sort((a, b) => b.gap - a.gap);
      if (short.length) remarks.push(`Short: ${short.slice(0, 3).map((x) => `${n.deploymentLabel(x.d)} −${x.gap}`).join("; ")}${short.length > 3 ? ` +${short.length - 3} more` : ""}`);
    }
    const repl = world.replacements.filter((r) => r.plannedReportAt.startsWith(date) && vis(r.outgoingWorkerId, date));
    const bad = repl.filter((r) => {
      const v = replacementView(world, idx, r);
      return v.status === "ABSENT" || v.status === "LATE" || v.overdue;
    });
    if (bad.length) remarks.push(`Replacement issues: ${bad.length}`);
    const extras = world.extraDuties.filter((x) => n.assignment.get(x.originalAssignmentId)?.date === date && vis(x.workerId, date));
    if (extras.length) remarks.push(`Extra duty: ${extras.length}`);
    const unverified = (idx.byDate.get(date) ?? []).filter(
      (s) => isPresent(s) && world.verifications[s.assignment.id]?.client !== "VERIFIED" && vis(s.assignment.workerId, date),
    ).length;
    if (unverified && date < world.today) remarks.push(`Pending verification: ${unverified}`);
    return { date, counts, total: counts.reduce((a, b) => a + b, 0), remarks: remarks.join(" · "), holiday: hol?.name };
  });
  const monthTotals = deployments.map((_, i) => rows.reduce((sum, r) => sum + (r.counts[i] ?? 0), 0));
  return {
    month,
    deployments,
    labels: deployments.map((d) => ({
      contractor: n.contractor.get(d.contractorId)!.name,
      department: n.department.get(d.departmentId)!.name,
    })),
    licensed: deployments.map((d) => strengthOn(d, last).licensed),
    approved: deployments.map((d) => strengthOn(d, last).approved),
    days: rows,
    monthTotals,
    grandTotal: monthTotals.reduce((a, b) => a + b, 0),
  };
}

export interface EmployeeRow {
  session: Session;
  workerId: string;
  name: string;
  contractor: string;
  department: string;
  designation: string;
  date: DateStr;
  shift: string;
  extraMins: number;
  isExtraShift: boolean;
  verification: string;
  replacement: string;
  remarks: string;
  sources: string;
}

export function employeeRows(
  world: World,
  idx: AttendanceIndex,
  viewer: Viewer,
  month: string,
  filter: { contractorId?: string; departmentId?: string; query?: string } = {},
): EmployeeRow[] {
  const n = names(world);
  const q = filter.query?.trim().toLowerCase();
  const rows: EmployeeRow[] = [];
  for (const date of monthDays(month)) {
    if (date > world.today) break;
    for (const s of idx.byDate.get(date) ?? []) {
      if (s.status === "UPCOMING") continue;
      const w = n.worker.get(s.assignment.workerId);
      if (!w) continue;
      const dep = deploymentOf(world, w, date);
      if (!dep || !canSeeDeployment(viewer, dep)) continue;
      if (filter.contractorId && dep.contractorId !== filter.contractorId) continue;
      if (filter.departmentId && dep.departmentId !== filter.departmentId) continue;
      if (q && !w.id.toLowerCase().includes(q) && !w.name.toLowerCase().includes(q)) continue;
      const isExtraShift = !!s.assignment.extraDutyId;
      const v = world.verifications[s.assignment.id];
      const repl = world.replacements.find((r) => r.replacementAssignmentId === s.assignment.id || r.outgoingAssignmentId === s.assignment.id);
      const remarks: string[] = [];
      if (s.lateMins) remarks.push(`Late ${s.lateMins}m`);
      if (s.earlyOutMins) remarks.push(`Early out ${s.earlyOutMins}m`);
      if (s.status === "MISSING_OUT") remarks.push("Missing OUT");
      if (s.hasManual) remarks.push("Manual correction");
      if (s.extensionMins > 0 && !world.extraDuties.some((x) => x.originalAssignmentId === s.assignment.id)) remarks.push("Extension without request");
      if (v?.client === "DISPUTED" && !v.resolved) remarks.push("Disputed");
      rows.push({
        session: s,
        workerId: w.id,
        name: w.name,
        contractor: n.contractor.get(dep.contractorId)!.name,
        department: n.department.get(dep.departmentId)!.name,
        designation: w.designation,
        date,
        shift: n.shift.get(s.assignment.shiftId)!.code,
        extraMins: isExtraShift ? s.netMins : s.extensionMins,
        isExtraShift,
        verification: v ? (v.client === "DISPUTED" ? (v.resolved ? "Dispute resolved" : "Disputed") : "Verified") : "Pending",
        replacement: repl ? replacementView(world, idx, repl).status.replace("_", " ") : "",
        remarks: remarks.join("; "),
        sources: [...new Set(s.punches.flatMap((p) => p.sources))].join(", "),
      });
    }
  }
  return rows;
}

export interface InvoiceLine {
  deployment: Deployment;
  label: string;
  approved: number;
  manpowerDays: number;
  verifiedDays: number;
  pendingDays: number;
  disputed: number;
  missingPunch: number;
  extraMins: number;
  uniqueWorkers: number;
}

/** Invoice support: manpower-days and unique workers are different measures and are reported separately. */
export function invoiceSupport(rows: EmployeeRow[], world: World, viewer: Viewer, month: string): InvoiceLine[] {
  const n = names(world);
  const last = monthDays(month).at(-1)!;
  return world.deployments
    .filter((d) => canSeeDeployment(viewer, d))
    .map((d) => {
      const label = n.deploymentLabel(d);
      const mine = rows.filter((r) => `${r.contractor} · ${r.department}` === label);
      const present = mine.filter((r) => isPresent(r.session));
      const days = new Set(present.map((r) => `${r.workerId}|${r.date}`));
      const verified = new Set(present.filter((r) => r.verification === "Verified" || r.verification === "Dispute resolved").map((r) => `${r.workerId}|${r.date}`));
      return {
        deployment: d,
        label,
        approved: strengthOn(d, last).approved,
        manpowerDays: days.size,
        verifiedDays: verified.size,
        pendingDays: days.size - verified.size,
        disputed: mine.filter((r) => r.verification === "Disputed").length,
        missingPunch: mine.filter((r) => r.session.status === "MISSING_OUT").length,
        extraMins: mine.reduce((sum, r) => sum + r.extraMins, 0),
        uniqueWorkers: new Set(present.map((r) => r.workerId)).size,
      };
    });
}
