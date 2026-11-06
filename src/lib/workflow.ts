import { extraActual, type AttendanceIndex } from "./attendance.ts";
import { toMin } from "./time.ts";
import type { ExtraDuty, ExtraStatus, Replacement, ReplacementStatus, World } from "./types.ts";

export interface ExtraView {
  status: ExtraStatus;
  actual: ReturnType<typeof extraActual>;
  plannedMins: number;
  /** Work happened without a valid approval; it stays on record and needs review. */
  review: string | null;
}

/** Display status combines the stored decision with what the punches say actually happened. */
export function extraView(world: World, idx: AttendanceIndex, x: ExtraDuty): ExtraView {
  const actual = extraActual(
    x.kind,
    idx.byAssignment.get(x.originalAssignmentId),
    x.extraAssignmentId ? idx.byAssignment.get(x.extraAssignmentId) : undefined,
    world.now,
  );
  const plannedMins = toMin(x.plannedEnd) - toMin(x.plannedStart);
  let status = x.status;
  let review: string | null = null;
  if (x.status === "APPROVED") {
    if (actual.running) status = "IN_PROGRESS";
    else if (actual.mins > 0) status = "COMPLETED";
  } else if (x.status !== "CLOSED" && actual.mins > 0) {
    status = "UNDER_REVIEW";
    review = x.status === "REJECTED" ? "Worked after the request was rejected" : "Worked before approval";
  }
  return { status, actual, plannedMins, review };
}

export type ExtraCommand = "submit" | "forward" | "approve" | "reject" | "close";

/** Allowed next steps. A late approval is still possible after work started; the record stays flagged. */
export function extraCommands(view: ExtraView, stored: ExtraStatus): ExtraCommand[] {
  switch (stored) {
    case "DRAFT":
      return ["submit"];
    case "REQUESTED":
      return ["forward", "reject"];
    case "PENDING_APPROVAL":
      return ["approve", "reject"];
    case "APPROVED":
      return view.status === "COMPLETED" ? ["close"] : [];
    case "REJECTED":
      return view.status === "UNDER_REVIEW" ? ["close"] : [];
    default:
      return [];
  }
}

export const COMMAND_STATUS: Record<ExtraCommand, ExtraStatus> = {
  submit: "REQUESTED",
  forward: "PENDING_APPROVAL",
  approve: "APPROVED",
  reject: "REJECTED",
  close: "CLOSED",
};

export interface ReplacementView {
  status: ReplacementStatus;
  arrival: string | null;
  /** Reliever should be on site by now and no punch has arrived. */
  overdue: boolean;
}

/** A reliever counts as reported only once a reconciled punch exists, never on a manual status alone. */
export function replacementView(world: World, idx: AttendanceIndex, r: Replacement): ReplacementView {
  const session = r.replacementAssignmentId ? idx.byAssignment.get(r.replacementAssignmentId) : undefined;
  const arrival = session?.in ?? null;
  const due = toMin(r.plannedReportAt) + world.policy.lateGraceMins;
  let status = r.status;
  if ((status === "ASSIGNED" || status === "CONFIRMED") && arrival) {
    status = toMin(arrival) > due ? "LATE" : "REPORTED";
  }
  const open = status === "NOT_ASSIGNED" || status === "ASSIGNED" || status === "CONFIRMED" || (status === "LATE" && !arrival);
  const overdue = open && !arrival && toMin(world.now) > due;
  return { status, arrival, overdue };
}

export const OPEN_REPLACEMENT: ReplacementStatus[] = ["NOT_ASSIGNED", "ASSIGNED", "CONFIRMED", "LATE"];

/**
 * Formal extra duty, the one rule shared by the register, the board and the dashboard: an additional shift, or a
 * regular shift extended under an extra-duty request that was not rejected. Keyed by assignment id, with the kind.
 * Merely punching out a little late (a "worked past shift" overstay) is not extra duty.
 */
export function formalExtraDuty(world: Pick<World, "extraDuties">): Map<string, "EXTENSION" | "ADDITIONAL_SHIFT"> {
  const out = new Map<string, "EXTENSION" | "ADDITIONAL_SHIFT">();
  for (const x of world.extraDuties) {
    if (x.extraAssignmentId) out.set(x.extraAssignmentId, "ADDITIONAL_SHIFT");
    else if (x.status !== "REJECTED") out.set(x.originalAssignmentId, "EXTENSION");
  }
  return out;
}
