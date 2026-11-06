// Synthetic demo data. Every name, number and punch here is generated; nothing is real client data.
// Deterministic for a given `now`, so the same day always shows the same demo.

import { WORK_DAY_STARTS_AT } from "../config.ts";
import { addDays, addMonths, dateRange, fromMin, monthOf, shiftWindow, toMin, workDate } from "./time.ts";
import type {
  Contractor,
  DateStr,
  DateTimeStr,
  Department,
  Deployment,
  Device,
  ExtraDuty,
  Holiday,
  RawPunch,
  Replacement,
  ShiftAssignment,
  ShiftTemplate,
  Skill,
  Verification,
  Worker,
  World,
} from "./types.ts";

/** The two face devices punches are generated from. Ids are what each punch carries as its source. */
export const DEVICES: Device[] = [
  { id: "FD-1", name: "Face device 1", location: "Main gate", kind: "FACE", direction: "IN_OUT", serialNo: "FD24-118734", ipAddress: "10.20.1.21", installedOn: "2026-03-20", active: true },
  { id: "FD-2", name: "Face device 2", location: "Canteen gate", kind: "FACE", direction: "IN_OUT", serialNo: "FD24-118752", ipAddress: "10.20.1.22", installedOn: "2026-03-20", active: true },
];

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Ramesh", "Suresh", "Lakshmi", "Anitha", "Venkatesh", "Manjunath", "Kavitha", "Raju", "Srinivas", "Deepa",
  "Ravi", "Prakash", "Nagaraj", "Geetha", "Mahesh", "Shanthi", "Ganesh", "Sunil", "Rekha", "Anil",
  "Mohan", "Shivakumar", "Bhavani", "Arjun", "Imran", "Salma", "Joseph", "Mary", "Anand", "Yashoda",
  "Basavaraj", "Harish", "Naveen", "Sangeetha", "Kiran", "Vinod", "Parvathi", "Rajesh", "Santosh", "Lokesh",
  "Rani", "Raghu", "Siddappa", "Fathima", "Abdul", "Thomas", "Gowri", "Hanumanth", "Shobha", "Praveen",
];
const INITIAL = "ABCDGHKMNPRSTV";
const FEMALE = new Set(["Lakshmi", "Anitha", "Kavitha", "Deepa", "Geetha", "Shanthi", "Rekha", "Bhavani", "Salma", "Mary", "Yashoda", "Sangeetha", "Parvathi", "Rani", "Fathima", "Gowri", "Shobha"]);
const MALE = FIRST.filter((f) => !FEMALE.has(f));
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Profile details for a seeded worker, derived from its index rather than the random stream, so adding them
 * left every generated punch (and so every attendance figure) unchanged.
 */
function profile(n: number, first: string, skill: Skill): Partial<Worker> {
  return {
    fatherName: `${MALE[(n * 7 + 3) % MALE.length]} ${INITIAL[(n * 5 + 1) % INITIAL.length]}`,
    gender: FEMALE.has(first) ? "FEMALE" : "MALE",
    dateOfBirth: `${1972 + ((n * 7) % 30)}-${pad(1 + ((n * 5) % 12))}-${pad(1 + ((n * 11) % 28))}`,
    mobile: `+91 9${String((n * 7919 + 1234567) % 1_000_000_000).padStart(9, "0")}`,
    skill,
    joinedOn: `2026-0${1 + (n % 3)}-${pad(1 + ((n * 3) % 28))}`,
    uan: String(100_100_000_000 + n * 7331),
    esicNo: String(3_100_000_000 + n * 1013),
    idProof: { type: "AADHAAR", last4: String(1000 + ((n * 37) % 9000)) },
    emergencyContact: `+91 8${String((n * 4441 + 7654321) % 1_000_000_000).padStart(9, "0")}`,
  };
}

export const CONTRACTORS: Contractor[] = [
  { id: "c-mayfair", code: "MAY", name: "Mayfair Consultancy", contactPerson: "R. Menon", phone: "+91 90000 00101", validFrom: "2026-04-01", validTo: "2027-03-31", active: true },
  { id: "c-svm", code: "SVM", name: "SRI VENKATARAMANA MANAGEMENTS (SVM)", contactPerson: "S. Murthy", phone: "+91 90000 00102", validFrom: "2026-01-01", validTo: "2026-12-31", active: true },
  { id: "c-pooja", code: "POO", name: "Pooja Agencies", contactPerson: "P. Shetty", phone: "+91 90000 00103", validFrom: "2026-04-01", validTo: "2027-03-31", active: true },
  { id: "c-jagruti", code: "JAG", name: "Jagruti Enterprises", contactPerson: "J. Patil", phone: "+91 90000 00104", validFrom: "2026-06-01", validTo: "2027-05-31", active: true },
  { id: "c-jk", code: "JKE", name: "JK Enterprize", contactPerson: "K. Jain", phone: "+91 90000 00105", validFrom: "2026-04-01", validTo: "2027-03-31", active: true },
  { id: "c-ganesh", code: "SGN", name: "Sree Ganesh", contactPerson: "G. Rao", phone: "+91 90000 00106", validFrom: "2026-04-01", validTo: "2027-03-31", active: true },
];

export const DEPARTMENTS: Department[] = [
  { id: "d-hk", name: "Housekeeping" },
  { id: "d-lu", name: "Loading & Unloading" },
  { id: "d-erema", name: "Erema (Casual)" },
  { id: "d-garden", name: "Gardening" },
  { id: "d-pack", name: "Packing & Dispatch" },
  { id: "d-coal", name: "Coal Yard" },
  { id: "d-canteen", name: "Canteen Services" },
];

const SKILL: Record<string, Skill> = {
  "d-hk": "UNSKILLED",
  "d-lu": "UNSKILLED",
  "d-erema": "UNSKILLED",
  "d-garden": "SEMI_SKILLED",
  "d-pack": "SEMI_SKILLED",
  "d-coal": "UNSKILLED",
  "d-canteen": "SEMI_SKILLED",
};

const DESIGNATION: Record<string, string> = {
  "d-hk": "Housekeeper",
  "d-lu": "Loader",
  "d-erema": "Casual helper",
  "d-garden": "Gardener",
  "d-pack": "Packer",
  "d-coal": "Yard helper",
  "d-canteen": "Canteen staff",
};

// Order, licence and approval figures are the client workbook's (Daily Manpower Summary, OCT_2026).
const DEPLOYMENT_SPEC: { c: string; d: string; licensed: number; approved: number; dayOnly?: boolean }[] = [
  { c: "c-mayfair", d: "d-hk", licensed: 30, approved: 25 },
  { c: "c-svm", d: "d-hk", licensed: 10, approved: 8 },
  { c: "c-svm", d: "d-lu", licensed: 25, approved: 20 },
  { c: "c-svm", d: "d-erema", licensed: 20, approved: 15 },
  { c: "c-svm", d: "d-garden", licensed: 5, approved: 5, dayOnly: true },
  { c: "c-pooja", d: "d-pack", licensed: 40, approved: 35 },
  { c: "c-jagruti", d: "d-pack", licensed: 20, approved: 18 },
  { c: "c-jk", d: "d-coal", licensed: 20, approved: 17 },
  { c: "c-ganesh", d: "d-canteen", licensed: 15, approved: 12 },
];

export const SHIFTS: ShiftTemplate[] = [
  { id: "s-day", code: "D", name: "Day 12h", start: "08:00", end: "20:00", breakMins: 60 },
  { id: "s-night", code: "N", name: "Night 12h", start: "20:00", end: "08:00", breakMins: 60 },
  { id: "s-gen", code: "G", name: "General", start: "09:00", end: "18:00", breakMins: 60 },
];

export function demoHolidays(year: number): Holiday[] {
  // Demo list; the client maintains the real one on the Holidays screen.
  return [
    { date: `${year}-01-26`, name: "Republic Day" },
    { date: `${year}-05-01`, name: "May Day" },
    { date: `${year}-08-15`, name: "Independence Day" },
    { date: `${year}-10-02`, name: "Gandhi Jayanti" },
    { date: `${year}-10-20`, name: "Dussehra" },
    { date: `${year}-11-08`, name: "Deepavali" },
  ];
}

export function generateWorld(now: DateTimeStr): World {
  const rnd = prng(20261103);
  const today = workDate(now, WORK_DAY_STARTS_AT);
  const from = `${addMonths(monthOf(today), -1)}-01`;
  const rosterTo = addDays(today, 6);
  const nowM = toMin(now);
  const holidays = demoHolidays(Number(today.slice(0, 4)));
  const holidaySet = new Set(holidays.map((h) => h.date));

  const deployments: Deployment[] = DEPLOYMENT_SPEC.map((s) => ({
    id: `dep-${s.c.slice(2)}-${s.d.slice(2)}`,
    contractorId: s.c,
    departmentId: s.d,
    strengths: [{ from: "2026-04-01", licensed: s.licensed, approved: s.approved }],
  }));
  // One effective-dated change so the history is visible: SVM loading approval raised mid-month.
  const lu = deployments.find((d) => d.id === "dep-svm-lu")!;
  lu.strengths = [
    { from: "2026-04-01", licensed: 25, approved: 18 },
    { from: `${monthOf(from)}-15`, licensed: 25, approved: 20 },
  ];

  // ---- Workers: approved strength plus ~12% relievers per deployment.
  const workers: Worker[] = [];
  const crews = new Map<string, { worker: Worker; crew: "D" | "N" | "G"; restDow: number }[]>();
  let nameIdx = 0;
  DEPLOYMENT_SPEC.forEach((spec, di) => {
    const c = CONTRACTORS.find((x) => x.id === spec.c)!;
    const size = Math.ceil(spec.approved * 1.12);
    const list: { worker: Worker; crew: "D" | "N" | "G"; restDow: number }[] = [];
    for (let i = 0; i < size; i++) {
      const seq = String(di * 100 + i + 1).padStart(4, "0");
      const first = FIRST[nameIdx % FIRST.length];
      const name = `${first} ${INITIAL[(nameIdx * 3 + Math.floor(nameIdx / FIRST.length)) % INITIAL.length]}`;
      const w: Worker = {
        id: `${c.code}-${seq}`,
        name,
        designation: i === 0 ? "Team leader" : DESIGNATION[spec.d],
        // Enrolment number already registered on the face devices.
        deviceId: String(10000 + di * 100 + i + 1),
        active: true,
        assignments: [{ from: "2026-04-01", contractorId: spec.c, departmentId: spec.d }],
        ...profile(nameIdx, first, i === 0 ? "SKILLED" : SKILL[spec.d]),
      };
      nameIdx++;
      workers.push(w);
      list.push({ worker: w, crew: spec.dayOnly ? "G" : i % 2 === 0 ? "D" : "N", restDow: i % 7 });
    }
    crews.set(`${spec.c}:${spec.d}`, list);
  });
  // One effective-dated transfer: an SVM housekeeper moves to gardening on the 16th of last month.
  const moved = crews.get("c-svm:d-hk")![5];
  moved.worker.assignments.push({ from: `${monthOf(from)}-16`, contractorId: "c-svm", departmentId: "d-garden" });

  // ---- Roster
  const shiftByCode = Object.fromEntries(SHIFTS.map((s) => [s.code, s])) as Record<string, ShiftTemplate>;
  const assignments: ShiftAssignment[] = [];
  const aid = (wid: string, date: DateStr, code: string) => `as-${wid}-${date}-${code}`;
  for (const date of dateRange(from, rosterTo)) {
    const dow = new Date(toMin(date) * 60000).getUTCDay();
    const holiday = holidaySet.has(date);
    for (const [key, list] of crews) {
      list.forEach((m, i) => {
        if (m.restDow === dow) return;
        if (holiday && i % 5 >= 2) return; // skeleton roster on holidays
        const a = m.worker.assignments;
        const dep = a.filter((p) => p.from <= date).at(-1)!;
        const crew = key === `${dep.contractorId}:${dep.departmentId}` ? m.crew : "G";
        assignments.push({ id: aid(m.worker.id, date, crew), workerId: m.worker.id, date, shiftId: shiftByCode[crew].id });
      });
    }
  }

  // ---- Scripted scenarios from the SRS (§7), placed relative to today.
  const extraDuties: ExtraDuty[] = [];
  const replacements: Replacement[] = [];
  /** Punch plans that override random generation for specific assignments. */
  const scripted = new Map<string, { absent?: boolean; inAt?: DateTimeStr; outAt?: DateTimeStr | null }>();
  const removeAssignment = (id: string) => {
    const i = assignments.findIndex((a) => a.id === id);
    if (i >= 0) assignments.splice(i, 1);
  };
  const findCrew = (key: string, crew: "D" | "N" | "G", date: DateStr, skip = 0) => {
    const dow = new Date(toMin(date) * 60000).getUTCDay();
    return crews.get(key)!.filter((m) => m.crew === crew && m.restDow !== dow && m.restDow !== (dow + 1) % 7)[skip].worker;
  };
  // Scripted events use fixed clock times; one that would fall after "now" is stamped at now instead.
  const ev = <S,>(at: DateTimeStr, by: string, status: S, note?: string) => ({ at: at > now ? now : at, by, status, note });

  // Scenario A: night reliever absent, day worker continues to 08:00 next day.
  {
    const d = addDays(today, -2);
    const day = findCrew("c-svm:d-lu", "D", d, 1);
    const night = findCrew("c-svm:d-lu", "N", d, 1);
    const dayA = aid(day.id, d, "D");
    const nightA = aid(night.id, d, "N");
    removeAssignment(aid(day.id, addDays(d, 1), "D")); // rest after a 24h duty
    scripted.set(nightA, { absent: true });
    scripted.set(dayA, { inAt: `${d}T07:52`, outAt: `${addDays(d, 1)}T08:04` });
    replacements.push({
      id: "rp-a", outgoingWorkerId: day.id, outgoingAssignmentId: dayA, replacementWorkerId: night.id,
      replacementAssignmentId: nightA, plannedReportAt: `${d}T20:00`, status: "ABSENT", handoverAt: `${addDays(d, 1)}T08:04`,
      history: [ev(`${d}T09:10`, "Contractor · SVM", "CONFIRMED"), ev(`${d}T20:20`, "Supervisor · Loading", "ABSENT", "Did not report; phone switched off.")],
    });
    extraDuties.push({
      id: "xd-a", workerId: day.id, kind: "EXTENSION", originalAssignmentId: dayA, plannedStart: `${d}T20:00`,
      plannedEnd: `${addDays(d, 1)}T08:00`, reason: "Replacement absent", supervisor: "Supervisor · Loading",
      remarks: "Dock 3 unloading could not stop. Worker agreed to continue.", consent: true, replacementId: "rp-a", status: "CLOSED",
      history: [
        ev(`${d}T20:25`, "Supervisor · Loading", "PENDING_APPROVAL"),
        ev(`${d}T20:40`, "Plant HR", "APPROVED", "Approved; compliance flag noted for review."),
        ev(`${addDays(d, 1)}T10:15`, "Plant HR", "CLOSED", "Actual 12h extension verified."),
      ],
    });
  }

  // Scenario B: additional shift on the next date (shortage in packing).
  {
    const d = addDays(today, -2);
    const nextD = addDays(d, 1);
    const w = crews.get("c-pooja:d-pack")!.find((m) => m.crew === "D" && m.restDow === new Date(toMin(nextD) * 60000).getUTCDay())!.worker;
    const orig = aid(w.id, d, "D");
    const extraA = `as-x-${w.id}-${nextD}`;
    assignments.push({ id: extraA, workerId: w.id, date: nextD, shiftId: "s-day", extraDutyId: "xd-b" });
    scripted.set(extraA, { inAt: `${nextD}T07:58`, outAt: `${nextD}T20:03` });
    extraDuties.push({
      id: "xd-b", workerId: w.id, kind: "ADDITIONAL_SHIFT", originalAssignmentId: orig, extraAssignmentId: extraA,
      plannedStart: `${nextD}T08:00`, plannedEnd: `${nextD}T20:00`, reason: "Emergency manpower shortage",
      supervisor: "Supervisor · Packing", remarks: "Export container loading; 4 packers short.", consent: true, status: "APPROVED",
      history: [ev(`${d}T16:00`, "Contractor · Pooja Agencies", "REQUESTED"), ev(`${d}T16:30`, "Plant HR", "APPROVED")],
    });
  }

  // Scenario C: reliever arrives at 23:00, outgoing worker leaves 23:15, so the extension is 3h 15m, not 12h.
  {
    const d = addDays(today, -1);
    const day = findCrew("c-jk:d-coal", "D", d, 2);
    const night = findCrew("c-jk:d-coal", "N", d, 2);
    const dayA = aid(day.id, d, "D");
    const nightA = aid(night.id, d, "N");
    scripted.set(dayA, { inAt: `${d}T07:55`, outAt: `${d}T23:15` });
    scripted.set(nightA, { inAt: `${d}T23:00`, outAt: `${addDays(d, 1)}T08:02` });
    replacements.push({
      id: "rp-c", outgoingWorkerId: day.id, outgoingAssignmentId: dayA, replacementWorkerId: night.id,
      replacementAssignmentId: nightA, plannedReportAt: `${d}T20:00`, status: "LATE", handoverAt: `${d}T23:15`,
      history: [ev(`${d}T08:30`, "Contractor · JK Enterprize", "CONFIRMED"), ev(`${d}T20:15`, "Supervisor · Coal Yard", "LATE", "Bus breakdown, ETA 23:00.")],
    });
    extraDuties.push({
      id: "xd-c", workerId: day.id, kind: "EXTENSION", originalAssignmentId: dayA, plannedStart: `${d}T20:00`,
      plannedEnd: `${addDays(d, 1)}T08:00`, reason: "Replacement late", supervisor: "Supervisor · Coal Yard",
      remarks: "Planned as full night cover; reliever arrived late.", consent: true, replacementId: "rp-c", status: "APPROVED",
      history: [ev(`${d}T20:20`, "Supervisor · Coal Yard", "PENDING_APPROVAL"), ev(`${d}T20:35`, "Plant HR", "APPROVED")],
    });
  }

  // Worked after a rejected request: actual time stays on record and goes to review.
  {
    const d = addDays(today, -3);
    const w = findCrew("c-mayfair:d-hk", "D", d, 3);
    const a = aid(w.id, d, "D");
    scripted.set(a, { inAt: `${d}T07:57`, outAt: `${d}T22:10` });
    extraDuties.push({
      id: "xd-r", workerId: w.id, kind: "EXTENSION", originalAssignmentId: a, plannedStart: `${d}T20:00`,
      plannedEnd: `${d}T22:00`, reason: "Operational requirement", supervisor: "Supervisor · Admin block",
      remarks: "Event clean-up.", consent: true, status: "REJECTED",
      history: [ev(`${d}T18:30`, "Contractor · Mayfair", "PENDING_APPROVAL"), ev(`${d}T19:10`, "Plant HR", "REJECTED", "Use night crew instead.")],
    });
  }

  // Tonight: reliever confirmed for canteen, and an extension awaiting approval in Erema.
  {
    const d = today;
    const out = findCrew("c-ganesh:d-canteen", "D", d, 1);
    const rel = findCrew("c-ganesh:d-canteen", "N", d, 1);
    scripted.set(aid(rel.id, d, "N"), { inAt: `${d}T19:56`, outAt: `${addDays(d, 1)}T08:03` });
    replacements.push({
      id: "rp-t1", outgoingWorkerId: out.id, outgoingAssignmentId: aid(out.id, d, "D"), replacementWorkerId: rel.id,
      replacementAssignmentId: aid(rel.id, d, "N"), plannedReportAt: `${d}T20:00`, status: "CONFIRMED",
      history: [ev(`${d}T07:40`, "Contractor · Sree Ganesh", "ASSIGNED"), ev(`${d}T09:05`, "Contractor · Sree Ganesh", "CONFIRMED")],
    });
    const ext = findCrew("c-svm:d-erema", "D", d, 1);
    const relE = findCrew("c-svm:d-erema", "N", d, 1);
    scripted.set(aid(relE.id, d, "N"), { absent: true });
    scripted.set(aid(ext.id, d, "D"), { inAt: `${d}T07:56`, outAt: `${addDays(d, 1)}T00:05` });
    replacements.push({
      id: "rp-t2", outgoingWorkerId: ext.id, outgoingAssignmentId: aid(ext.id, d, "D"), replacementWorkerId: relE.id,
      replacementAssignmentId: aid(relE.id, d, "N"), plannedReportAt: `${d}T20:00`, status: "ASSIGNED",
      history: [ev(`${d}T08:15`, "Contractor · SVM", "ASSIGNED")],
    });
    replacements.push({
      id: "rp-t3", outgoingWorkerId: findCrew("c-jagruti:d-pack", "D", d, 2).id,
      outgoingAssignmentId: aid(findCrew("c-jagruti:d-pack", "D", d, 2).id, d, "D"), replacementWorkerId: null,
      replacementAssignmentId: null, plannedReportAt: `${d}T20:00`, status: "NOT_ASSIGNED", history: [],
    });
    extraDuties.push({
      id: "xd-t", workerId: ext.id, kind: "EXTENSION", originalAssignmentId: aid(ext.id, d, "D"), plannedStart: `${d}T20:00`,
      plannedEnd: `${addDays(d, 1)}T00:00`, reason: "Replacement unavailable", supervisor: "Supervisor · Erema",
      remarks: "Cover until the 00:00 reliever from SVM.", consent: true, replacementId: "rp-t2", status: "PENDING_APPROVAL",
      history: [ev(`${d}T11:20`, "Contractor · SVM", "REQUESTED"), ev(`${d}T11:45`, "Supervisor · Erema", "PENDING_APPROVAL")],
    });
  }

  // ---- Punches
  const punches: RawPunch[] = [];
  let seq = 1;
  const shiftById = new Map(SHIFTS.map((s) => [s.id, s]));
  const canteen = new Set(workers.filter((w) => w.assignments[0].departmentId === "d-canteen").map((w) => w.id));
  const add = (workerId: string, atMin: number) => {
    // Draw every random number first, so the stream (and all past data) never depends on "now".
    const rSource = rnd();
    const rRepeat = rnd();
    const rCross = rnd();
    const id = seq;
    seq += 2;
    if (atMin > nowM) return; // nothing from the future
    const at = fromMin(atMin);
    const source = canteen.has(workerId) || rSource < 0.2 ? "FD-2" : "FD-1";
    const eventId = `${source}-${String(id).padStart(7, "0")}`;
    punches.push({ eventId, source, workerId, at });
    if (rRepeat < 0.03) punches.push({ eventId, source, workerId, at }); // re-delivered by the device
    if (rCross < 0.02) {
      const other = source === "FD-1" ? "FD-2" : "FD-1";
      punches.push({ eventId: `${other}-${String(id + 1).padStart(7, "0")}`, source: other, workerId, at: fromMin(atMin + 1) });
    }
  };
  const jitter = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));

  for (const a of assignments) {
    if (a.date > today) continue;
    const s = shiftById.get(a.shiftId)!;
    const w = shiftWindow(a.date, s.start, s.end);
    const start = toMin(w.start);
    const end = toMin(w.end);
    const plan = scripted.get(a.id);
    const roll = rnd(); // always consume to keep the stream stable
    if (plan) {
      if (plan.absent) continue;
      add(a.workerId, toMin(plan.inAt!));
      if (end - start >= 600) {
        const b = start + 300 + jitter(0, 60);
        add(a.workerId, b);
        add(a.workerId, b + 45);
      }
      if (plan.outAt) add(a.workerId, toMin(plan.outAt));
      continue;
    }
    if (roll < 0.06) continue; // absent
    const late = rnd() < 0.08;
    add(a.workerId, start + (late ? jitter(12, 75) : jitter(-25, 4)));
    if (rnd() < 0.7) {
      const b = start + jitter(240, 360);
      add(a.workerId, b);
      add(a.workerId, b + jitter(30, 60));
    }
    const r = rnd();
    if (r < 0.025) continue; // missing OUT
    add(a.workerId, r < 0.055 ? end - jitter(30, 120) : end + jitter(-4, 18));
  }

  // ---- Verifications: last month fully reviewed, this month partly.
  const verifications: Record<string, Verification> = {};
  const lastMonth = monthOf(from);
  for (const a of assignments) {
    if (a.date >= addDays(today, -1)) continue;
    const r = rnd();
    const old = monthOf(a.date) === lastMonth;
    if (!old && a.date > addDays(today, -4) && r < 0.6) continue;
    if (!old && r < 0.15) continue;
    const disputed = rnd() < 0.004;
    verifications[a.id] = {
      key: a.id,
      client: disputed ? "DISPUTED" : "VERIFIED",
      contractor: disputed ? "CORRECTION_REQUESTED" : "CONFIRMED",
      notes: disputed
        ? [
            { at: `${addDays(a.date, 1)}T10:00`, by: "Supervisor", text: "Not seen at the station after 16:00." },
            { at: `${addDays(a.date, 1)}T12:30`, by: "Contractor", text: "Worker was moved to the stores dock on verbal instruction." },
          ]
        : [],
      resolved: disputed && old && rnd() < 0.8,
    };
  }

  return {
    today,
    now,
    contractors: CONTRACTORS,
    departments: DEPARTMENTS,
    deployments,
    workers,
    devices: DEVICES,
    shifts: SHIFTS,
    assignments,
    punches,
    extraDuties,
    replacements,
    verifications,
    holidays,
    policy: {
      lateGraceMins: 10,
      minRestHours: 8,
      minRestMode: "warn",
      maxContinuousHours: 16,
      maxContinuousMode: "warn",
      maxWeeklyHours: 72,
      maxWeeklyMode: "warn",
    },
  };
}
