// Domain types. Datetimes are site-local "YYYY-MM-DDTHH:mm" strings (site time zone in config);
// dates are "YYYY-MM-DD". Keeping one representation avoids browser-time-zone drift.

export type DateStr = string;
export type DateTimeStr = string;

export interface Contractor {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  phone: string;
  validFrom: DateStr;
  validTo: DateStr;
  active: boolean;
}

export interface Department {
  id: string;
  name: string;
}

/** Effective-dated licensed / approved strength for one contractor-department deployment. */
export interface StrengthEntry {
  from: DateStr;
  licensed: number;
  approved: number;
}

export interface Deployment {
  id: string;
  contractorId: string;
  departmentId: string;
  strengths: StrengthEntry[];
}

export interface AssignmentPeriod {
  from: DateStr;
  contractorId: string;
  departmentId: string;
}

export const SKILLS = ["UNSKILLED", "SEMI_SKILLED", "SKILLED", "HIGHLY_SKILLED"] as const;
export type Skill = (typeof SKILLS)[number];
export const ID_PROOFS = ["AADHAAR", "VOTER_ID", "DRIVING_LICENCE", "PAN"] as const;
export type IdProof = (typeof ID_PROOFS)[number];

export interface Worker {
  /** Employee code. Proposed from the contractor code on creation and editable then; fixed afterwards. */
  id: string;
  name: string;
  designation: string;
  /**
   * The worker's enrolment number in the attendance devices. Device punches carry this number and are matched
   * to the worker by it, so it must be unique. Workers already enrolled keep their existing number.
   */
  deviceId: string;
  active: boolean;
  /** Effective-dated history; never overwritten, latest `from` <= date wins. */
  assignments: AssignmentPeriod[];
  fatherName?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth?: DateStr;
  mobile?: string;
  skill?: Skill;
  joinedOn?: DateStr;
  /** Universal Account Number (EPF), 12 digits. */
  uan?: string;
  /** ESIC insurance number, 10 or 17 digits. */
  esicNo?: string;
  /** Only the type and the last four characters are kept: no full identity numbers in this system. */
  idProof?: { type: IdProof; last4: string };
  emergencyContact?: string;
  address?: string;
}

/** Attendance device. Its id is what punches carry as their source. */
export interface Device {
  id: string;
  name: string;
  location: string;
  kind: "FACE" | "FINGERPRINT" | "CARD";
  direction: "IN" | "OUT" | "IN_OUT";
  serialNo: string;
  ipAddress: string;
  installedOn: DateStr;
  active: boolean;
}

export interface ShiftTemplate {
  id: string;
  code: string;
  name: string;
  start: string; // HH:mm
  end: string; // HH:mm, earlier than start means the shift crosses midnight
  breakMins: number;
  /** Inactive shifts stay in history but can no longer be rostered. Undefined means active. */
  active?: boolean;
}

export interface ShiftAssignment {
  id: string;
  workerId: string;
  date: DateStr; // work date = shift start date
  shiftId: string;
  /** Set when the assignment is an additional shift created by extra duty. */
  extraDutyId?: string;
}

/** A device id, or MANUAL for an authorised correction. */
export type PunchSource = string;

export interface RawPunch {
  /** Source event id. Repeated ids from the same source are duplicates. */
  eventId: string;
  source: PunchSource;
  workerId: string;
  at: DateTimeStr;
  manual?: { reason: string; approver: string; enteredBy: string };
}

export const EXTRA_REASONS = [
  "Replacement absent",
  "Replacement late",
  "Replacement unavailable",
  "Emergency manpower shortage",
  "Operational requirement",
  "Other",
] as const;
export type ExtraReason = (typeof EXTRA_REASONS)[number];

export type ExtraStatus =
  | "DRAFT"
  | "REQUESTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "UNDER_REVIEW"
  | "CLOSED";

export interface StatusEvent<S> {
  at: DateTimeStr;
  by: string;
  status: S;
  note?: string;
}

export interface ExtraDuty {
  id: string;
  workerId: string;
  /** EXTENSION = continues straight after the regular shift; ADDITIONAL_SHIFT = separate shift on a later date. */
  kind: "EXTENSION" | "ADDITIONAL_SHIFT";
  originalAssignmentId: string;
  /** For ADDITIONAL_SHIFT: the roster assignment created for the extra shift. */
  extraAssignmentId?: string;
  plannedStart: DateTimeStr;
  plannedEnd: DateTimeStr;
  reason: ExtraReason;
  supervisor: string;
  remarks: string;
  consent: boolean;
  replacementId?: string;
  status: ExtraStatus;
  history: StatusEvent<ExtraStatus>[];
}

export type ReplacementStatus =
  | "NOT_ASSIGNED"
  | "ASSIGNED"
  | "CONFIRMED"
  | "REPORTED"
  | "LATE"
  | "ABSENT"
  | "CANCELLED"
  | "REPLACED";

export interface Replacement {
  id: string;
  /** Worker whose shift ends and who must hand over. */
  outgoingWorkerId: string;
  outgoingAssignmentId: string;
  /** Expected reliever; null while NOT_ASSIGNED. */
  replacementWorkerId: string | null;
  replacementAssignmentId: string | null;
  plannedReportAt: DateTimeStr;
  status: ReplacementStatus;
  handoverAt?: DateTimeStr;
  /** If this replacement was itself replaced, the follow-up record. */
  replacedById?: string;
  history: StatusEvent<ReplacementStatus>[];
}

export interface Verification {
  /** assignment id */
  key: string;
  client: "VERIFIED" | "DISPUTED" | null;
  contractor: "CONFIRMED" | "CORRECTION_REQUESTED" | null;
  notes: { at: DateTimeStr; by: string; text: string }[];
  resolved: boolean;
}

export interface Holiday {
  date: DateStr;
  name: string;
}

export type RuleMode = "off" | "warn" | "block";
export interface Policy {
  lateGraceMins: number;
  minRestHours: number;
  minRestMode: RuleMode;
  maxContinuousHours: number;
  maxContinuousMode: RuleMode;
  maxWeeklyHours: number;
  maxWeeklyMode: RuleMode;
}

export type Role =
  | "CLIENT_ADMIN"
  | "CLIENT_SUPERVISOR"
  | "CONTRACTOR_ADMIN"
  | "ACCOUNTS"
  | "AUDITOR";

export interface Viewer {
  role: Role;
  name: string;
  /** Required for CONTRACTOR_ADMIN: the only contractor they may see. */
  contractorId?: string;
}

export interface World {
  today: DateStr;
  now: DateTimeStr;
  contractors: Contractor[];
  departments: Department[];
  deployments: Deployment[];
  workers: Worker[];
  devices: Device[];
  shifts: ShiftTemplate[];
  assignments: ShiftAssignment[];
  punches: RawPunch[];
  extraDuties: ExtraDuty[];
  replacements: Replacement[];
  verifications: Record<string, Verification>;
  holidays: Holiday[];
  policy: Policy;
}
