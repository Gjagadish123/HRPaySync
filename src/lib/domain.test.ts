// Run: npm test  (Node's built-in runner with type stripping; no test framework needed)
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, buildSession, buildAttendance, isPresent, awaitingVerification, shiftStarted, statusOf } from "./attendance.ts";
import { evaluate, isBlocked } from "./compliance.ts";
import { apply, can, permissionFor, violation, type LogEntry, type Action } from "./actions.ts";
import { dailySummary, employeeRows, invoiceSupport } from "./reports.ts";
import { generateWorld } from "./seed.ts";
import { monthDays, shiftWindow, siteNow, addDays } from "./time.ts";
import { extraView, formalExtraDuty, replacementView } from "./workflow.ts";
import type { RawPunch, ShiftTemplate, Viewer } from "./types.ts";

const DAY: ShiftTemplate = { id: "s-day", code: "D", name: "Day", start: "08:00", end: "20:00", breakMins: 60 };
const NIGHT: ShiftTemplate = { id: "s-night", code: "N", name: "Night", start: "20:00", end: "08:00", breakMins: 60 };
const p = (at: string, source: RawPunch["source"] = "FD-1", eventId = at): RawPunch => ({ eventId, source, workerId: "W1", at });
const admin: Viewer = { role: "CLIENT_ADMIN", name: "HR" };
const NOW = "2026-11-05T14:30";

test("time: overnight window and full months", () => {
  assert.deepEqual(shiftWindow("2026-11-03", "20:00", "08:00"), { start: "2026-11-03T20:00", end: "2026-11-04T08:00" });
  assert.equal(monthDays("2026-10").length, 31);
  assert.equal(monthDays("2026-10").at(-1), "2026-10-31");
  assert.equal(siteNow("Asia/Kolkata", new Date("2026-11-05T09:00:00Z")), "2026-11-05T14:30");
});

test("reconcile drops re-delivered events and merges cross-device duplicates", () => {
  const r = reconcile([p("2026-11-03T08:00", "FD-1", "e1"), p("2026-11-03T08:00", "FD-1", "e1"), p("2026-11-03T08:01", "FD-2", "e9"), p("2026-11-03T20:00", "FD-1", "e2")]);
  assert.equal(r.punches.length, 2);
  assert.deepEqual(r.punches[0].sources, ["FD-1", "FD-2"]);
  assert.equal(r.dropped, 2);
});

test("overnight shift keeps its date boundary", () => {
  const a = { id: "a", workerId: "W1", date: "2026-11-03", shiftId: "s-night" };
  const s = buildSession(a, NIGHT, [p("2026-11-03T19:55"), p("2026-11-04T08:05")], NOW, Infinity, 10);
  assert.equal(s.status, "PRESENT");
  assert.equal(s.in, "2026-11-03T19:55");
  assert.equal(s.out, "2026-11-04T08:05");
  assert.equal(s.regularMins, 720);
  assert.equal(s.extensionMins, 0, "5 minutes past the end is within grace, not an extension");
  const long = buildSession(a, NIGHT, [p("2026-11-03T19:55"), p("2026-11-04T08:40")], NOW, Infinity, 10);
  assert.equal(long.extensionMins, 40);
});

test("scenario C: late reliever means only the actual extension counts", () => {
  const a = { id: "a", workerId: "W1", date: "2026-11-03", shiftId: "s-day" };
  const s = buildSession(a, DAY, [p("2026-11-03T07:55"), p("2026-11-03T23:15")], NOW, Infinity, 10);
  assert.equal(s.extensionMins, 195); // 3h 15m, not 12h
  assert.equal(s.regularMins, 720);
});

test("breaks are deducted, late arrival and missing OUT are flagged", () => {
  const a = { id: "a", workerId: "W1", date: "2026-11-03", shiftId: "s-day" };
  const s = buildSession(a, DAY, [p("2026-11-03T08:30"), p("2026-11-03T13:00"), p("2026-11-03T13:45"), p("2026-11-03T20:00")], NOW, Infinity, 10);
  assert.equal(s.lateMins, 30);
  assert.equal(s.breakMins, 45);
  assert.equal(s.netMins, 11.5 * 60 - 45);
  const m = buildSession(a, DAY, [p("2026-11-03T07:58")], NOW, 0, 10);
  assert.equal(m.status, "MISSING_OUT");
  assert.ok(isPresent(m));
});

const world = generateWorld(NOW);
const idx = buildAttendance(world);

test("seed is deterministic", () => {
  const again = generateWorld(NOW);
  assert.equal(again.punches.length, world.punches.length);
  assert.equal(again.workers.length, world.workers.length);
  // Approved strength from the client workbook (155) plus ~12% relievers per deployment.
  assert.ok(world.workers.length >= 170 && world.workers.length <= 190, `workers ${world.workers.length}`);
  assert.ok(!world.punches.some((x) => x.at > NOW), "no punches from the future");
  // Early in the work day the scripted events (07:40 ... 11:45) are still in the future.
  const EARLY = "2026-11-05T07:00";
  const early = generateWorld(EARLY);
  const history = [...early.extraDuties, ...early.replacements].flatMap((x) => x.history as { at: string }[]);
  assert.ok(history.every((h) => h.at <= EARLY), "no workflow history from the future");
});

test("scenario A: absent reliever, worker extends to 08:00 next day", () => {
  const x = world.extraDuties.find((e) => e.id === "xd-a")!;
  const v = extraView(world, idx, x);
  assert.ok(v.actual.mins >= 720 && v.actual.mins <= 730, `extension ${v.actual.mins}`);
  const r = world.replacements.find((e) => e.id === "rp-a")!;
  assert.equal(replacementView(world, idx, r).status, "ABSENT");
});

test("scenario C in the seed: reliever late, extension 3h 15m", () => {
  const v = extraView(world, idx, world.extraDuties.find((e) => e.id === "xd-c")!);
  assert.equal(v.actual.mins, 195);
  assert.equal(v.status, "COMPLETED");
  assert.equal(v.plannedMins, 720);
});

test("rejected request with actual work stays on record for review", () => {
  const v = extraView(world, idx, world.extraDuties.find((e) => e.id === "xd-r")!);
  assert.equal(v.status, "UNDER_REVIEW");
  assert.ok(v.actual.mins > 0);
});

test("daily summary covers every calendar day and totals through the last day", () => {
  const s = dailySummary(world, idx, admin, "2026-10");
  assert.equal(s.days.length, 31);
  assert.equal(s.days.at(-1)!.date, "2026-10-31");
  const sumDays = s.days.reduce((t, d) => t + (d.total ?? 0), 0);
  assert.equal(s.grandTotal, sumDays);
  assert.ok(s.days.at(-1)!.total! > 0, "31st is counted");
});

test("manpower-days are distinct from unique workers", () => {
  const rows = employeeRows(world, idx, admin, "2026-10");
  const inv = invoiceSupport(rows, world, admin, "2026-10");
  for (const line of inv) assert.ok(line.manpowerDays >= line.uniqueWorkers);
  assert.ok(inv.some((l) => l.manpowerDays > l.uniqueWorkers * 10));
});

test("contractor users only see their own workforce", () => {
  const v: Viewer = { role: "CONTRACTOR_ADMIN", name: "SVM", contractorId: "c-svm" };
  const s = dailySummary(world, idx, v, "2026-10");
  assert.ok(s.deployments.every((d) => d.contractorId === "c-svm"));
  const rows = employeeRows(world, idx, v, "2026-10");
  assert.ok(rows.length > 0 && rows.every((r) => r.contractor === world.contractors.find((c) => c.id === "c-svm")!.name));
  assert.equal(can(v, permissionFor({ type: "extra/status", id: "x", status: "APPROVED" })), false);
});

test("compliance: overlap always blocks, long duty warns per policy", () => {
  const w = world.workers[0];
  const a = world.assignments.find((x) => x.workerId === w.id && x.date === addDays(world.today, 1))!;
  const s = world.shifts.find((x) => x.id === a.shiftId)!;
  const win = shiftWindow(a.date, s.start, s.end);
  const r = evaluate(world, w.id, { start: win.start, end: win.end });
  assert.ok(isBlocked(r));
  const ext = evaluate(world, w.id, { start: win.end, end: addDays(a.date, 1) + "T" + s.end, extendsAssignmentId: a.id });
  const cont = ext.find((x) => x.rule.startsWith("Continuous"))!;
  assert.equal(cont.ok, false);
  assert.equal(cont.mode, "warn");
});

test("manual correction adds a punch without touching raw events", () => {
  const before = world.punches.length;
  const entry: LogEntry = {
    id: "l1", at: NOW, by: "HR", role: "CLIENT_ADMIN", summary: "",
    action: { type: "punch/manual", punch: { eventId: "m1", source: "MANUAL", workerId: "W1", at: NOW, manual: { reason: "Device offline", approver: "HR", enteredBy: "HR" } } } satisfies Action,
  };
  const next = apply(world, entry);
  assert.equal(next.punches.length, before + 1);
  assert.equal(world.punches.length, before, "original world untouched");
});

test("work date rolls over at the configured time so night shifts stay on today's board", async () => {
  const { workDate } = await import("./time.ts");
  assert.equal(workDate("2026-11-05T00:40", "06:00"), "2026-11-04");
  assert.equal(workDate("2026-11-05T06:00", "06:00"), "2026-11-05");
  assert.equal(generateWorld("2026-11-05T00:40").today, "2026-11-04");
});

test("Excel daily summary keeps the client layout and totals through the 31st", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const { buildDailySummary, buildEmployeeRows, buildInvoiceSupport } = await import("./excel.ts");
  const s = dailySummary(world, idx, admin, "2026-10");
  const wb = buildDailySummary(ExcelJS, s, { client: "Client", site: "Main Plant" });
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  const ws = back.getWorksheet("OCT_2026")!;
  assert.ok(ws, "sheet named like the client's workbook");
  assert.equal(ws.getCell("A1").value, "  DAILY CONTRACTOR MANPOWER  DETAIL OCTOBER - 2026");
  assert.deepEqual(ws.model.merges, ["A1:L1", "C2:F2"], "title across the sheet, SVM merged over its four departments");
  assert.equal(ws.getCell("A2").value, "Contractor Name");
  assert.equal(ws.getCell("K2").value, "TOTAL");
  assert.equal(ws.getCell("A1").font.name, "Times New Roman");
  assert.equal(ws.getCell("A1").font.color?.argb, "FFFF0000");
  assert.equal((ws.getCell("B2").fill as { fgColor: { argb: string } }).fgColor.argb, "FFBDD7EE");
  assert.equal((ws.getCell("B3").fill as { fgColor: { argb: string } }).fgColor.argb, "FFFFF2CC");
  assert.equal(ws.getColumn(1).width, 21.140625);
  assert.deepEqual([ws.getCell("B4").value, ws.getCell("B5").value], [30, 25], "licence and approval from the client sheet");
  assert.equal((ws.getCell("K4").value as { formula: string }).formula, "SUM(B4:J4)");
  assert.equal(ws.getCell("A6").numFmt, "mm-dd-yy");
  assert.equal(ws.getCell("A37").value, "TOTAL MANPOWER");
  assert.equal(ws.getCell("A4").value, "Manpower as Per License");
  assert.equal(ws.getCell("A5").value, "Manpower as Per Approval");
  const last = 6 + 31 - 1;
  assert.equal((ws.getCell(`A${last}`).value as Date).toISOString().slice(0, 10), "2026-10-31");
  const total = ws.getCell(`B${last + 1}`).value as { formula: string; result: number };
  assert.equal(total.formula, `SUM(B6:B${last})`, "monthly total includes the last day");
  assert.equal(total.result, s.monthTotals[0]);
  const rows = employeeRows(world, idx, admin, "2026-10");
  const emp = buildEmployeeRows(ExcelJS, rows, "Main Plant");
  assert.equal(emp.getWorksheet("Shift detail")!.rowCount, rows.length + 1);
  const night = emp.getWorksheet("Shift detail")!.getRow(2);
  assert.ok(night.getCell(9).value instanceof Date, "scheduled IN is a real date-time");
  const inv = buildInvoiceSupport(ExcelJS, invoiceSupport(rows, world, admin, "2026-10"), "2026-10", { client: "Client", site: "Main Plant" });
  assert.ok(inv.worksheets[0].getCell("C3").value === "Manpower-days");
});

test("refreshing later the same day never changes past attendance", () => {
  const early = generateWorld("2026-11-05T14:30");
  const later = generateWorld("2026-11-05T22:10");
  const key = (p: RawPunch) => `${p.eventId}|${p.workerId}|${p.at}`;
  const before = early.punches.filter((p) => p.at <= "2026-11-05T14:30").map(key).sort();
  const after = later.punches.filter((p) => p.at <= "2026-11-05T14:30").map(key).sort();
  assert.deepEqual(after, before);
  assert.deepEqual(Object.keys(later.verifications).sort(), Object.keys(early.verifications).sort());
});

test("awaiting verification: worked and not client-verified; disputed still counts, absent never does", () => {
  const sessions = [...idx.byAssignment.values()].filter((s) => s.assignment.date < world.today);
  const present = sessions.find((s) => isPresent(s))!;
  const absent = sessions.find((s) => s.status === "ABSENT")!;
  assert.equal(awaitingVerification(present, undefined), true);
  assert.equal(awaitingVerification(present, { client: null }), true);
  assert.equal(awaitingVerification(present, { client: "DISPUTED" }), true);
  assert.equal(awaitingVerification(present, { client: "VERIFIED" }), false);
  assert.equal(awaitingVerification(absent, undefined), false);
  // The seeded month has both verified and unverified work, so the dashboard card and the filter are meaningful.
  const month = sessions.filter((s) => s.assignment.date.startsWith("2026-10"));
  const pending = month.filter((s) => awaitingVerification(s, world.verifications[s.assignment.id])).length;
  assert.ok(pending > 0 && pending < month.filter(isPresent).length, `pending ${pending}`);
});

test("roster lock: a regular shift is locked from its start time; extra-duty shifts never are", () => {
  const day: ShiftTemplate = { id: "d", code: "D", name: "Day", start: "08:00", end: "20:00", breakMins: 60 };
  const night: ShiftTemplate = { id: "n", code: "N", name: "Night", start: "20:00", end: "08:00", breakMins: 60 };
  const a = { id: "a1", workerId: "W1", date: "2026-11-05", shiftId: "d" };
  assert.equal(shiftStarted(a, day, "2026-11-05T07:59"), false);
  assert.equal(shiftStarted(a, day, "2026-11-05T08:00"), true);
  assert.equal(shiftStarted({ ...a, shiftId: "n" }, night, "2026-11-05T12:30"), false, "tonight's night shift is still editable at midday");
  assert.equal(shiftStarted({ ...a, shiftId: "n" }, night, "2026-11-05T20:00"), true);
  assert.equal(shiftStarted({ ...a, extraDutyId: "xd-1" }, day, "2026-11-05T12:00"), false);
});

test("seeded workers have unique device ids and profile details; seeded devices are the punch sources", () => {
  const ids = world.workers.map((w) => w.deviceId);
  assert.equal(new Set(ids).size, ids.length, "device ids are unique");
  assert.ok(world.workers.every((w) => w.gender && w.dateOfBirth && w.skill && w.joinedOn && w.uan?.length === 12 && w.idProof?.last4.length === 4));
  const deviceIds = new Set(world.devices.map((d) => d.id));
  assert.ok(world.punches.every((p) => p.source === "MANUAL" || deviceIds.has(p.source)), "every punch comes from a known device");
});

test("device, shift, worker and contractor edits are recorded as actions", () => {
  const entry = (action: Action, i: number): LogEntry => ({ id: `e${i}`, at: world.now, by: "HR", role: "CLIENT_ADMIN", summary: "", action });
  const dev = { id: "FD-3", name: "Face device 3", location: "Stores gate", kind: "FACE" as const, direction: "IN" as const, serialNo: "S3", ipAddress: "10.20.1.23", installedOn: world.today, active: true };
  let w2 = apply(world, entry({ type: "device/create", device: dev }, 1));
  w2 = apply(w2, entry({ type: "device/update", device: { ...dev, active: false } }, 2));
  assert.equal(w2.devices.find((d) => d.id === "FD-3")!.active, false);
  const day = w2.shifts.find((s) => s.code === "D")!;
  w2 = apply(w2, entry({ type: "shift/update", shift: { ...day, name: "Day (12h)", active: false } }, 3));
  assert.equal(w2.shifts.find((s) => s.id === day.id)!.name, "Day (12h)");
  const worker = w2.workers[0];
  w2 = apply(w2, entry({ type: "worker/update", workerId: worker.id, patch: { mobile: "+91 9000000000", deviceId: "99999" } }, 4));
  const updated = w2.workers.find((x) => x.id === worker.id)!;
  assert.deepEqual([updated.mobile, updated.deviceId, updated.assignments], ["+91 9000000000", "99999", worker.assignments]);
  assert.equal(permissionFor({ type: "device/create", device: dev }), "manageDevices");
  assert.equal(can({ role: "CLIENT_SUPERVISOR", name: "S" }, "manageDevices"), false);
  assert.equal(world.devices.length, 2, "the original world is never mutated");
});

test("day status: late wins over present and on duty; the rest map one to one", () => {
  const s = [...idx.byAssignment.values()];
  const late = s.find((x) => x.status === "PRESENT" && x.lateMins > 0)!;
  const onTime = s.find((x) => x.status === "PRESENT" && x.lateMins === 0)!;
  assert.equal(statusOf(late), "LATE");
  assert.equal(statusOf(onTime), "PRESENT");
  assert.equal(statusOf({ ...onTime, status: "ON_DUTY" }), "ON_DUTY");
  assert.equal(statusOf({ ...late, status: "ON_DUTY" }), "LATE");
  assert.equal(statusOf({ ...onTime, status: "ABSENT" }), "ABSENT");
  assert.equal(statusOf({ ...onTime, status: "MISSING_OUT" }), "MISSING_OUT");
  assert.equal(statusOf({ ...onTime, status: "UPCOMING" }), "UPCOMING");
});

test("invariants: duplicate codes and device ids, inactive or started shifts, and retiming worked shifts are refused", () => {
  const w0 = world.workers[0];
  const w1 = world.workers[1];
  const worker = { ...w0, id: "NEW-0001", deviceId: w1.deviceId };
  assert.match(violation(world, { type: "worker/create", worker: { ...worker, id: w0.id.toLowerCase() } })!, /Employee code/);
  assert.match(violation(world, { type: "worker/create", worker })!, /Device ID/);
  assert.equal(violation(world, { type: "worker/create", worker: { ...worker, deviceId: "PENDING-NEW-0001" } }), null);
  assert.match(violation(world, { type: "worker/update", workerId: w0.id, patch: { deviceId: w1.deviceId } })!, /already used/);
  assert.match(violation(world, { type: "worker/update", workerId: w0.id, patch: { name: null } })!, /can't be cleared/);
  assert.equal(violation(world, { type: "worker/update", workerId: w0.id, patch: { deviceId: w0.deviceId, uan: null } }), null);
  assert.match(violation(world, { type: "device/create", device: { ...world.devices[0], id: "fd-1" } })!, /already used/);
  const day = world.shifts.find((s) => s.code === "D")!;
  assert.match(violation(world, { type: "shift/update", shift: { ...day, start: "07:00", end: "19:00" } })!, /already been worked/);
  assert.equal(violation(world, { type: "shift/update", shift: { ...day, name: "Day", breakMins: 45 } }), null);
  const inactive = { ...world, shifts: world.shifts.map((s) => (s.id === day.id ? { ...s, active: false } : s)) };
  const future = addDays(world.today, 3);
  assert.match(violation(inactive, { type: "roster/set", cells: [{ workerId: w0.id, date: future }], shiftId: day.id })!, /inactive/);
  const running = world.assignments.find((a) => a.date === world.today && !a.extraDutyId && a.shiftId === day.id)!;
  assert.match(violation(world, { type: "roster/set", cells: [{ workerId: running.workerId, date: running.date }], shiftId: null })!, /already started/);
  assert.equal(violation(world, { type: "roster/set", cells: [{ workerId: w0.id, date: future }], shiftId: null }), null);
});

test("clearing an optional worker field with null removes it, and the change survives a JSON round trip", () => {
  const w0 = world.workers[0];
  const action: Action = JSON.parse(JSON.stringify({ type: "worker/update", workerId: w0.id, patch: { idProof: null, uan: null } }));
  const next = apply(world, { id: "c1", at: world.now, by: "HR", role: "CLIENT_ADMIN", summary: "", action });
  const updated = next.workers.find((x) => x.id === w0.id)!;
  assert.equal("idProof" in updated, false);
  assert.equal("uan" in updated, false);
  assert.equal(updated.name, w0.name);
});

test("review fixes: started target shifts, inactive workers and shifts, backdated strength, and retiming into the past are refused", () => {
  const day = world.shifts.find((s) => s.code === "D")!;
  const rest = world.workers.find((w) => !world.assignments.some((a) => a.workerId === w.id && a.date === world.today))!;
  assert.match(violation(world, { type: "roster/set", cells: [{ workerId: rest.id, date: world.today }], shiftId: day.id })!, /already started/);
  const off = { ...world, workers: world.workers.map((w) => (w.id === rest.id ? { ...w, active: false } : w)) };
  assert.match(violation(off, { type: "roster/set", cells: [{ workerId: rest.id, date: addDays(world.today, 2) }], shiftId: day.id })!, /inactive/);
  assert.equal(violation(off, { type: "roster/set", cells: [{ workerId: rest.id, date: addDays(world.today, 2) }], shiftId: null }), null, "clearing is allowed");
  const dep = world.deployments[0];
  assert.match(violation(world, { type: "strength/set", deploymentId: dep.id, entry: { from: addDays(world.today, -1), licensed: 30, approved: 10 } })!, /today or later/);
  assert.equal(violation(world, { type: "strength/set", deploymentId: dep.id, entry: { from: world.today, licensed: 30, approved: 25 } }), null);
  const night = world.shifts.find((s) => s.code === "N")!;
  // Tonight's N (20:00) has not started at 14:30; moving it to 12:00 would make it start in the past.
  assert.match(violation(world, { type: "shift/update", shift: { ...night, id: night.id, start: "12:00", end: "00:00" } }) ?? "", /already|later start/);
  const inactiveDay = { ...world, shifts: world.shifts.map((s) => (s.id === day.id ? { ...s, active: false } : s)) };
  const xa = { id: "x-as", workerId: rest.id, date: addDays(world.today, 2), shiftId: day.id, extraDutyId: "xd-new" };
  assert.match(violation(inactiveDay, { type: "extra/create", extra: world.extraDuties[0], extraAssignment: xa })!, /inactive/);
});

test("deactivating a worker clears their regular shifts that had not started, deterministically from the entry time", () => {
  const w0 = world.workers.find((w) => world.assignments.some((a) => a.workerId === w.id && a.date > world.today))!;
  const entry = (at: string): LogEntry => ({ id: "d1", at, by: "HR", role: "CLIENT_ADMIN", summary: "", action: { type: "worker/active", workerId: w0.id, active: false } });
  const next = apply(world, entry(NOW));
  const mine = (w: typeof world) => w.assignments.filter((a) => a.workerId === w0.id);
  assert.ok(mine(next).every((a) => a.date <= world.today), "no future regular shifts remain");
  assert.ok(mine(next).some((a) => a.date < world.today), "history is kept");
  assert.deepEqual(mine(apply(world, entry(NOW))), mine(next), "the same entry gives the same result on replay");
});

test("worked time never goes negative, and formal extra duty excludes rejected extensions and plain overstay", () => {
  const all = [...idx.byAssignment.values()];
  assert.ok(all.every((s) => s.netMins >= 0 && s.regularMins >= 0));
  const formal = formalExtraDuty(world);
  const rejected = world.extraDuties.find((x) => x.status === "REJECTED" && !x.extraAssignmentId)!;
  assert.equal(formal.has(rejected.originalAssignmentId), false);
  const overstay = all.find((s) => s.extensionMins > 0 && !formal.has(s.assignment.id))!;
  assert.ok(overstay, "seed has plain overstays that are not extra duty");
  assert.ok([...formal.values()].includes("ADDITIONAL_SHIFT") && [...formal.values()].includes("EXTENSION"));
});
