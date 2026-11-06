import { isPresent, type AttendanceIndex, type Session } from "@/lib/attendance";
import { addDays, fmtDT, fmtDur, timeOf } from "@/lib/time";
import type { DateStr, Viewer, World } from "@/lib/types";
import { canSeeDeployment, deploymentOf, strengthOn, type Names } from "@/lib/world";
import { extraView, replacementView } from "@/lib/workflow";

/** Sessions on a work date that the viewer may see, tagged with the deployment they count against. */
export function scopedSessions(world: World, idx: AttendanceIndex, n: Names, viewer: Viewer, date: DateStr) {
  const out: { session: Session; deploymentId: string }[] = [];
  for (const s of idx.byDate.get(date) ?? []) {
    const w = n.worker.get(s.assignment.workerId);
    const dep = w && deploymentOf(world, w, date);
    if (!dep || !canSeeDeployment(viewer, dep)) continue;
    out.push({ session: s, deploymentId: dep.id });
  }
  return out;
}

export interface Exception {
  id: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  severity: "alert" | "warn";
  /** Shifts this exception is about, so the board can tag their T-cards. */
  assignmentIds: string[];
}

/** Everything on the board that needs a person to act, most urgent first. */
export function exceptions(world: World, idx: AttendanceIndex, n: Names, viewer: Viewer): Exception[] {
  const list: Exception[] = [];
  const today = world.today;
  const visible = (workerId: string, date: DateStr) => {
    const w = n.worker.get(workerId);
    const dep = w && deploymentOf(world, w, date);
    return !!dep && canSeeDeployment(viewer, dep);
  };
  const who = (id: string) => `${n.worker.get(id)?.name ?? id} (${id})`;

  for (const r of world.replacements) {
    const date = r.plannedReportAt.slice(0, 10);
    if (date < addDays(today, -1) || !visible(r.outgoingWorkerId, date)) continue;
    const v = replacementView(world, idx, r);
    if (v.status === "NOT_ASSIGNED") {
      list.push({ id: r.id, severity: "alert", title: "No reliever assigned", detail: `${who(r.outgoingWorkerId)} hands over at ${fmtDT(r.plannedReportAt)}.`, href: `/replacements#${r.id}`, action: "Assign reliever", assignmentIds: [r.outgoingAssignmentId] });
    } else if (v.overdue) {
      const out = idx.byAssignment.get(r.outgoingAssignmentId);
      const cover = out?.status === "ON_DUTY" ? `${who(r.outgoingWorkerId)} is still on duty.` : out?.out ? `${who(r.outgoingWorkerId)} left at ${fmtDT(out.out)}.` : "The post may be uncovered.";
      list.push({ id: r.id, severity: "alert", title: "Reliever not reported", detail: `${who(r.replacementWorkerId!)} was due ${fmtDT(r.plannedReportAt)}. ${cover}`, href: `/replacements#${r.id}`, action: "Escalate or replace", assignmentIds: [r.outgoingAssignmentId, r.replacementAssignmentId].filter((x): x is string => !!x) });
    }
  }

  for (const x of world.extraDuties) {
    if (!visible(x.workerId, x.plannedStart.slice(0, 10))) continue;
    const v = extraView(world, idx, x);
    if (x.status === "PENDING_APPROVAL" || x.status === "REQUESTED") {
      list.push({ id: x.id, severity: "warn", title: "Extra duty awaiting approval", detail: `${who(x.workerId)} · ${timeOf(x.plannedStart)}–${timeOf(x.plannedEnd)} · ${x.reason}.`, href: `/extra-duty#${x.id}`, action: "Review request", assignmentIds: [x.originalAssignmentId, x.extraAssignmentId].filter((a): a is string => !!a) });
    } else if (v.status === "UNDER_REVIEW") {
      list.push({ id: x.id, severity: "alert", title: v.review ?? "Extra duty under review", detail: `${who(x.workerId)} worked ${fmtDur(v.actual.mins)} beyond the shift.`, href: `/extra-duty#${x.id}`, action: "Review actual time", assignmentIds: [x.originalAssignmentId, x.extraAssignmentId].filter((a): a is string => !!a) });
    } else if (v.status === "COMPLETED") {
      list.push({ id: x.id, severity: "warn", title: "Extra duty done, not closed", detail: `${who(x.workerId)} · actual extension recorded, needs closing after verification.`, href: `/extra-duty#${x.id}`, action: "Close", assignmentIds: [x.originalAssignmentId, x.extraAssignmentId].filter((a): a is string => !!a) });
    }
  }

  const yesterday = addDays(today, -1);
  const missing = scopedSessions(world, idx, n, viewer, yesterday).filter((s) => s.session.status === "MISSING_OUT");
  if (missing.length) {
    list.push({ id: "missing-out", severity: "warn", title: `${missing.length} missing OUT punch${missing.length > 1 ? "es" : ""} yesterday`, detail: "Worked time can't be calculated until the OUT is corrected.", href: `/attendance?date=${yesterday}&status=MISSING_OUT`, action: "Correct punches", assignmentIds: missing.map((m) => m.session.assignment.id) });
  }

  const todaySessions = scopedSessions(world, idx, n, viewer, today);
  const presentBy = new Map<string, number>();
  const startedBy = new Map<string, number>();
  for (const { session, deploymentId } of todaySessions) {
    if (session.status !== "UPCOMING") startedBy.set(deploymentId, (startedBy.get(deploymentId) ?? 0) + 1);
    if (isPresent(session)) presentBy.set(deploymentId, (presentBy.get(deploymentId) ?? 0) + 1);
  }
  for (const d of world.deployments) {
    if (!canSeeDeployment(viewer, d) || !startedBy.get(d.id)) continue;
    const absent = (startedBy.get(d.id) ?? 0) - (presentBy.get(d.id) ?? 0);
    if (absent >= 2) {
      list.push({ id: `abs-${d.id}`, severity: "warn", title: `${absent} absent · ${n.deploymentLabel(d)}`, detail: `Rostered for shifts already started today and no punch received. Approved strength ${strengthOn(d, today).approved}.`, href: `/attendance?date=${today}&status=ABSENT`, action: "See who", assignmentIds: todaySessions.filter((t) => t.deploymentId === d.id && t.session.status === "ABSENT").map((t) => t.session.assignment.id) });
    }
  }

  const disputes = Object.values(world.verifications).filter((v) => {
    if (v.client !== "DISPUTED" || v.resolved) return false;
    const a = n.assignment.get(v.key);
    return !!a && visible(a.workerId, a.date);
  });
  if (disputes.length) {
    list.push({ id: "disputes", severity: "warn", title: `${disputes.length} open attendance dispute${disputes.length > 1 ? "s" : ""}`, detail: "Client and contractor disagree; both submissions are kept until resolved.", href: "/attendance?status=DISPUTED", action: "Resolve", assignmentIds: disputes.map((v) => v.key) });
  }

  return list.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "alert" ? -1 : 1));
}
