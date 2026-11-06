import { shiftStarted } from "./attendance.ts";
import { shiftWindow, toMin } from "./time.ts";
import type {
  AssignmentPeriod,
  Contractor,
  Department,
  Deployment,
  DateStr,
  DateTimeStr,
  Device,
  ExtraDuty,
  ExtraStatus,
  Holiday,
  Policy,
  RawPunch,
  Replacement,
  ReplacementStatus,
  Role,
  ShiftAssignment,
  ShiftTemplate,
  StrengthEntry,
  Viewer,
  Worker,
  World,
} from "./types.ts";

type Profile = Omit<Worker, "id" | "assignments" | "active">;
/** Worker fields that can be edited after creation. null clears an optional field (it survives the saved JSON log). */
export type WorkerProfile = { [K in keyof Profile]?: Profile[K] | null };

/** Every change is an action. The ordered log is both the persistence format and the audit trail. */
export type Action =
  | { type: "extra/create"; extra: ExtraDuty; extraAssignment?: ShiftAssignment }
  | { type: "extra/status"; id: string; status: ExtraStatus; note?: string }
  | { type: "repl/create"; replacement: Replacement; assignment?: ShiftAssignment }
  | { type: "repl/assign"; id: string; workerId: string; assignmentId: string; assignment?: ShiftAssignment }
  | { type: "repl/status"; id: string; status: ReplacementStatus; note?: string; handoverAt?: DateTimeStr }
  | { type: "punch/manual"; punch: RawPunch }
  | { type: "verify/client"; keys: string[]; value: "VERIFIED" | "DISPUTED"; note?: string }
  | { type: "verify/contractor"; keys: string[]; value: "CONFIRMED" | "CORRECTION_REQUESTED"; note?: string }
  | { type: "verify/resolve"; key: string; note: string }
  | { type: "roster/set"; cells: { workerId: string; date: DateStr }[]; shiftId: string | null }
  | { type: "shift/create"; shift: ShiftTemplate }
  /** Edit a shift template. The screen only allows timing changes for shifts with no started assignments. */
  | { type: "shift/update"; shift: ShiftTemplate }
  | { type: "device/create"; device: Device }
  | { type: "device/update"; device: Device }
  | { type: "worker/create"; worker: Worker }
  /** Edit profile details. The employee code, deployment history and active flag have their own actions. */
  | { type: "worker/update"; workerId: string; patch: WorkerProfile }
  | { type: "contractor/update"; contractor: Contractor }
  | { type: "worker/transfer"; workerId: string; period: AssignmentPeriod }
  | { type: "worker/active"; workerId: string; active: boolean }
  | { type: "strength/set"; deploymentId: string; entry: StrengthEntry }
  | { type: "contractor/create"; contractor: Contractor }
  | { type: "department/create"; department: Department }
  | { type: "deployment/create"; deployment: Deployment }
  | { type: "holiday/add"; holiday: Holiday }
  | { type: "holiday/remove"; date: DateStr }
  | { type: "policy/set"; policy: Policy };

export interface LogEntry {
  id: string;
  at: DateTimeStr;
  by: string;
  role: Role;
  summary: string;
  action: Action;
}

export type Permission =
  | "manageMasters"
  | "manageWorkers"
  | "editRoster"
  | "createExtra"
  | "forwardExtra"
  | "approveExtra"
  | "manageReplacement"
  | "markReplacement"
  | "manualPunch"
  | "verifyClient"
  | "confirmContractor"
  | "resolveDispute"
  | "exportReports"
  | "viewAudit"
  | "manageHolidays"
  | "managePolicy"
  | "manageDevices";

const MATRIX: Record<Permission, Role[]> = {
  manageMasters: ["CLIENT_ADMIN"],
  manageWorkers: ["CLIENT_ADMIN", "CONTRACTOR_ADMIN"],
  editRoster: ["CLIENT_ADMIN", "CLIENT_SUPERVISOR"],
  createExtra: ["CLIENT_ADMIN", "CLIENT_SUPERVISOR", "CONTRACTOR_ADMIN"],
  forwardExtra: ["CLIENT_ADMIN", "CLIENT_SUPERVISOR"],
  approveExtra: ["CLIENT_ADMIN"],
  manageReplacement: ["CLIENT_ADMIN", "CLIENT_SUPERVISOR", "CONTRACTOR_ADMIN"],
  markReplacement: ["CLIENT_ADMIN", "CLIENT_SUPERVISOR"],
  manualPunch: ["CLIENT_ADMIN", "CLIENT_SUPERVISOR"],
  verifyClient: ["CLIENT_ADMIN", "CLIENT_SUPERVISOR"],
  confirmContractor: ["CONTRACTOR_ADMIN"],
  resolveDispute: ["CLIENT_ADMIN"],
  exportReports: ["CLIENT_ADMIN", "CLIENT_SUPERVISOR", "CONTRACTOR_ADMIN", "ACCOUNTS", "AUDITOR"],
  viewAudit: ["CLIENT_ADMIN", "AUDITOR"],
  manageHolidays: ["CLIENT_ADMIN"],
  managePolicy: ["CLIENT_ADMIN"],
  manageDevices: ["CLIENT_ADMIN"],
};

export const can = (viewer: Viewer, p: Permission) => MATRIX[p].includes(viewer.role);
export const PERMISSION_MATRIX = MATRIX;

/** Which permission an action needs. Checked on dispatch as well as in the UI. */
export function permissionFor(a: Action): Permission {
  switch (a.type) {
    case "extra/create":
      return "createExtra";
    case "extra/status":
      return a.status === "APPROVED" || a.status === "REJECTED" || a.status === "CLOSED"
        ? "approveExtra"
        : a.status === "PENDING_APPROVAL"
          ? "forwardExtra"
          : "createExtra";
    case "repl/create":
    case "repl/assign":
      return "manageReplacement";
    case "repl/status":
      return a.status === "CONFIRMED" || a.status === "CANCELLED" ? "manageReplacement" : "markReplacement";
    case "punch/manual":
      return "manualPunch";
    case "verify/client":
      return "verifyClient";
    case "verify/contractor":
      return "confirmContractor";
    case "verify/resolve":
      return "resolveDispute";
    case "roster/set":
    case "shift/create":
    case "shift/update":
      return "editRoster";
    case "device/create":
    case "device/update":
      return "manageDevices";
    case "worker/create":
    case "worker/update":
    case "worker/transfer":
    case "worker/active":
      return "manageWorkers";
    case "strength/set":
    case "contractor/create":
    case "contractor/update":
    case "department/create":
    case "deployment/create":
      return "manageMasters";
    case "holiday/add":
    case "holiday/remove":
      return "manageHolidays";
    case "policy/set":
      return "managePolicy";
  }
}

const norm = (s: string) => s.trim().toUpperCase();

/**
 * Invariants every change must keep. The store checks this before applying an action, so a rule holds even if a
 * screen forgets it; the screens check the same things first to give the message next to the field.
 */
export function violation(w: World, a: Action): string | null {
  switch (a.type) {
    case "worker/create": {
      if (w.workers.some((x) => norm(x.id) === norm(a.worker.id))) return `Employee code ${a.worker.id} is already used.`;
      const dev = a.worker.deviceId;
      if (!dev.startsWith("PENDING-") && w.workers.some((x) => x.deviceId === dev)) return `Device ID ${dev} is already used by another worker.`;
      return null;
    }
    case "worker/update": {
      const p = a.patch;
      if ([p.name, p.designation, p.deviceId].some((v) => v === null || (typeof v === "string" && !v.trim())))
        return "Name, designation and device ID can't be cleared.";
      if (p.deviceId && !p.deviceId.startsWith("PENDING-") && w.workers.some((x) => x.id !== a.workerId && x.deviceId === p.deviceId))
        return `Device ID ${p.deviceId} is already used by another worker.`;
      return null;
    }
    case "device/create":
      return w.devices.some((d) => norm(d.id) === norm(a.device.id)) ? `Device code ${a.device.id} is already used.` : null;
    case "device/update":
      return w.devices.some((d) => d.id === a.device.id) ? null : `Device ${a.device.id} does not exist.`;
    case "contractor/create":
      return w.contractors.some((c) => norm(c.code) === norm(a.contractor.code)) ? `Contractor code ${a.contractor.code} is already used.` : null;
    case "shift/create":
      return w.shifts.some((s) => norm(s.code) === norm(a.shift.code)) ? `Shift code ${a.shift.code} is already used.` : null;
    case "shift/update": {
      const cur = w.shifts.find((s) => s.id === a.shift.id);
      if (!cur) return "That shift does not exist.";
      if (cur.code !== a.shift.code) return "A shift's code can't change.";
      const retimed = cur.start !== a.shift.start || cur.end !== a.shift.end;
      if (retimed && w.assignments.some((x) => x.shiftId === cur.id && shiftStarted(x, cur, w.now)))
        return `Shift ${cur.code} has already been worked, so its timings can't change. Create a new shift instead.`;
      // Moving the start earlier must not make a rostered shift start in the past either.
      if (retimed && w.assignments.some((x) => x.shiftId === cur.id && shiftStarted(x, a.shift, w.now)))
        return `With those timings a rostered ${cur.code} shift would already have started. Choose a later start.`;
      return null;
    }
    case "roster/set": {
      if (a.shiftId) {
        const s = w.shifts.find((x) => x.id === a.shiftId);
        if (!s) return "That shift does not exist.";
        if (s.active === false) return `Shift ${s.code} is inactive, so it can't be rostered.`;
        const late = a.cells.find((c) => shiftStarted({ id: "", workerId: c.workerId, date: c.date, shiftId: s.id }, s, w.now));
        if (late) return `Shift ${s.code} on ${late.date} has already started, so it can't be rostered now.`;
        const inactive = a.cells.find((c) => w.workers.find((x) => x.id === c.workerId)?.active === false);
        if (inactive) return `${inactive.workerId} is inactive, so they can't be rostered.`;
      }
      const cells = new Set(a.cells.map((c) => `${c.workerId}|${c.date}`));
      const started = w.assignments.some((x) => {
        if (x.extraDutyId || !cells.has(`${x.workerId}|${x.date}`)) return false;
        const s = w.shifts.find((t) => t.id === x.shiftId);
        return !!s && shiftStarted(x, s, w.now);
      });
      return started ? "A selected shift has already started, so it can't be changed." : null;
    }
    case "strength/set":
      return a.entry.from < w.today ? "A strength change takes effect today or later; past reports are never rewritten." : null;
    case "extra/create":
      return inactiveShift(w, a.extraAssignment?.shiftId);
    case "repl/create":
    case "repl/assign":
      return inactiveShift(w, a.assignment?.shiftId);
    default:
      return null;
  }
}

function inactiveShift(w: World, shiftId: string | undefined): string | null {
  const s = shiftId ? w.shifts.find((x) => x.id === shiftId) : undefined;
  return s?.active === false ? `Shift ${s.code} is inactive, so no one can be put on it.` : null;
}

const upsertVerification = (w: World, key: string) =>
  w.verifications[key] ?? { key, client: null, contractor: null, notes: [], resolved: false };

function patchWorker(x: Worker, patch: WorkerProfile): Worker {
  const next: Record<string, unknown> = { ...x };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else if (v !== undefined) next[k] = v;
  }
  return next as unknown as Worker;
}

/** Pure reducer. Never deletes punches; corrections are added as new manual events. */
export function apply(w: World, e: LogEntry): World {
  const a = e.action;
  switch (a.type) {
    case "extra/create":
      return {
        ...w,
        extraDuties: [...w.extraDuties, a.extra],
        assignments: a.extraAssignment ? [...w.assignments, a.extraAssignment] : w.assignments,
      };
    case "extra/status":
      return {
        ...w,
        extraDuties: w.extraDuties.map((x) =>
          x.id === a.id
            ? { ...x, status: a.status, history: [...x.history, { at: e.at, by: e.by, status: a.status, note: a.note }] }
            : x,
        ),
      };
    case "repl/create":
      return {
        ...w,
        replacements: [...w.replacements, a.replacement],
        assignments: a.assignment ? [...w.assignments, a.assignment] : w.assignments,
      };
    case "repl/assign":
      return {
        ...w,
        assignments: a.assignment ? [...w.assignments, a.assignment] : w.assignments,
        replacements: w.replacements.map((r) =>
          r.id === a.id
            ? {
                ...r,
                replacementWorkerId: a.workerId,
                replacementAssignmentId: a.assignmentId,
                status: "ASSIGNED",
                history: [...r.history, { at: e.at, by: e.by, status: "ASSIGNED" as const, note: `Reliever ${a.workerId}` }],
              }
            : r,
        ),
      };
    case "repl/status":
      return {
        ...w,
        replacements: w.replacements.map((r) =>
          r.id === a.id
            ? {
                ...r,
                status: a.status,
                handoverAt: a.handoverAt ?? r.handoverAt,
                history: [...r.history, { at: e.at, by: e.by, status: a.status, note: a.note }],
              }
            : r,
        ),
      };
    case "punch/manual":
      return { ...w, punches: [...w.punches, a.punch] };
    case "verify/client":
    case "verify/contractor": {
      const verifications = { ...w.verifications };
      for (const key of a.keys) {
        const v = upsertVerification(w, key);
        verifications[key] = {
          ...v,
          ...(a.type === "verify/client" ? { client: a.value, resolved: false } : { contractor: a.value }),
          notes: a.note ? [...v.notes, { at: e.at, by: e.by, text: a.note }] : v.notes,
        };
      }
      return { ...w, verifications };
    }
    case "verify/resolve": {
      const v = upsertVerification(w, a.key);
      return {
        ...w,
        verifications: {
          ...w.verifications,
          [a.key]: { ...v, resolved: true, notes: [...v.notes, { at: e.at, by: e.by, text: `Resolved: ${a.note}` }] },
        },
      };
    }
    case "roster/set": {
      const cells = new Set(a.cells.map((c) => `${c.workerId}|${c.date}`));
      // Only regular assignments are replaced; extra-duty shifts are left alone.
      const kept = w.assignments.filter((x) => x.extraDutyId || !cells.has(`${x.workerId}|${x.date}`));
      const added: ShiftAssignment[] = a.shiftId
        ? a.cells.map((c) => ({ id: `as-${c.workerId}-${c.date}-${a.shiftId}-${e.id.slice(0, 8)}`, workerId: c.workerId, date: c.date, shiftId: a.shiftId! }))
        : [];
      return { ...w, assignments: [...kept, ...added] };
    }
    case "shift/create":
      return { ...w, shifts: [...w.shifts, a.shift] };
    case "shift/update":
      return { ...w, shifts: w.shifts.map((s) => (s.id === a.shift.id ? a.shift : s)) };
    case "device/create":
      return { ...w, devices: [...w.devices, a.device] };
    case "device/update":
      return { ...w, devices: w.devices.map((d) => (d.id === a.device.id ? a.device : d)) };
    case "worker/create":
      return { ...w, workers: [...w.workers, a.worker] };
    case "worker/update":
      return { ...w, workers: w.workers.map((x) => (x.id === a.workerId ? patchWorker(x, a.patch) : x)) };
    case "contractor/update":
      return { ...w, contractors: w.contractors.map((c) => (c.id === a.contractor.id ? a.contractor : c)) };
    case "worker/transfer":
      return {
        ...w,
        workers: w.workers.map((x) => (x.id === a.workerId ? { ...x, assignments: [...x.assignments, a.period] } : x)),
      };
    case "worker/active": {
      const workers = w.workers.map((x) => (x.id === a.workerId ? { ...x, active: a.active } : x));
      if (a.active) return { ...w, workers };
      // Deactivating also clears the worker's regular shifts that had not started when it happened (the entry time,
      // so a replay gives the same result); they stop piling up absences. Worked shifts and extra duty stay.
      const at = toMin(e.at);
      const assignments = w.assignments.filter((x) => {
        if (x.workerId !== a.workerId || x.extraDutyId) return true;
        const s = w.shifts.find((t) => t.id === x.shiftId);
        return !s || toMin(shiftWindow(x.date, s.start, s.end).start) <= at;
      });
      return { ...w, workers, assignments };
    }
    case "strength/set":
      return {
        ...w,
        deployments: w.deployments.map((d) =>
          d.id === a.deploymentId
            ? { ...d, strengths: [...d.strengths.filter((s) => s.from !== a.entry.from), a.entry] }
            : d,
        ),
      };
    case "contractor/create":
      return { ...w, contractors: [...w.contractors, a.contractor] };
    case "department/create":
      return { ...w, departments: [...w.departments, a.department] };
    case "deployment/create":
      return { ...w, deployments: [...w.deployments, a.deployment] };
    case "holiday/add":
      return { ...w, holidays: [...w.holidays.filter((h) => h.date !== a.holiday.date), a.holiday].sort((x, y) => x.date.localeCompare(y.date)) };
    case "holiday/remove":
      return { ...w, holidays: w.holidays.filter((h) => h.date !== a.date) };
    case "policy/set":
      return { ...w, policy: a.policy };
  }
}
