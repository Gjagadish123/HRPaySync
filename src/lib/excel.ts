// Real .xlsx output in the browser (exceljs is loaded only when an export is requested).
import { isPresent } from "./attendance.ts";
import type { DailySummary, EmployeeRow, InvoiceLine } from "./reports.ts";
import { toMin } from "./time.ts";

type ExcelJS = typeof import("exceljs");

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const sheetName = (month: string) => `${MON[Number(month.slice(5, 7)) - 1]}_${month.slice(0, 4)}`;

/** Wall-clock site time as an Excel date (exceljs serialises Dates from UTC). */
const xlDate = (dt: string) => new Date(toMin(dt) * 60000);
const xlDur = (mins: number) => mins / 1440;
const colLetter = (i: number) => {
  let s = "";
  for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const HEAD = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE3E6DF" } };

async function load(): Promise<ExcelJS> {
  const mod = await import("exceljs");
  return (mod as unknown as { default?: ExcelJS }).default ?? mod;
}

async function download(wb: import("exceljs").Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Styles copied from the client's "Daily Manpower Summary .xlsx" (sheet OCT_2026). Theme colours are written
// as the RGB Excel shows for them (Office theme), because exceljs ships a different default theme.
const TNR = "Times New Roman";
const RED = { argb: "FFFF0000" };
const SLATE = { argb: "FF222A35" }; // Text 2, darker 50%
const solid = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const TITLE_FILL = solid("FFFBE5D6"); // Accent 2 (orange), lighter 80%
const CONTRACTOR_FILL = solid("FFBDD7EE"); // Accent 1 (blue), lighter 60%
const DEPARTMENT_FILL = solid("FFFFF2CC"); // Accent 4 (gold), lighter 80%
const LINE = { style: "thin" as const };
const BOX = { top: LINE, left: LINE, bottom: LINE, right: LINE };
const OPEN_RIGHT = { top: LINE, left: LINE, bottom: LINE };
const CENTER = { horizontal: "center" as const, vertical: "middle" as const };
const CENTER_WRAP = { ...CENTER, wrapText: true };
/** Column widths of the client sheet; deployments past the ninth get the median width. */
const WIDTHS = [11.85546875, 11.7109375, 11.85546875, 7.85546875, 9, 8.7109375, 9.5703125, 9, 7.85546875];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

/**
 * Daily Contractor Manpower Detail, cell for cell in the client's layout: merged title, contractor row
 * (one contractor merged across its departments), department row, licence and approval rows in red,
 * one row per calendar day with a SUM total, and a TOTAL MANPOWER row. Two deliberate differences from
 * the client file: totals run through the last day of the month (theirs stop at row 35, so the 31st was
 * dropped), and every deployment column gets its total (theirs left SVM's D-F blank).
 */
export function buildDailySummary(Excel: ExcelJS, s: DailySummary, meta: { client: string; site: string }) {
  const wb = new Excel.Workbook();
  wb.creator = `${meta.client} Manpower`;
  const ws = wb.addWorksheet(sheetName(s.month));
  const n = s.deployments.length;
  const totalCol = n + 2;
  const remarksCol = n + 3;
  const L = colLetter;
  const lastData = L(n + 1);

  ws.getColumn(1).width = 21.140625;
  for (let i = 0; i < n; i++) ws.getColumn(i + 2).width = WIDTHS[i] ?? 9;
  ws.getColumn(totalCol).width = 6.85546875;
  ws.getColumn(remarksCol).width = 7.7109375;
  for (let c = 1; c <= remarksCol; c++) {
    ws.getColumn(c).style = { font: { name: "Calibri", size: 11, color: { theme: 1 } }, alignment: CENTER };
  }

  const put = (
    r: number,
    c: number,
    value: import("exceljs").CellValue,
    o: { size?: number; bold?: boolean; color?: { argb: string }; fill?: ReturnType<typeof solid>; border?: object; align?: object; numFmt?: string } = {},
  ) => {
    const cell = ws.getCell(r, c);
    cell.value = value;
    cell.font = { name: TNR, size: o.size ?? 9, bold: o.bold ?? false, color: o.color ?? SLATE };
    if (o.fill) cell.fill = o.fill;
    cell.border = (o.border ?? BOX) as import("exceljs").Borders;
    cell.alignment = (o.align ?? CENTER) as import("exceljs").Alignment;
    if (o.numFmt) cell.numFmt = o.numFmt;
  };

  // Row 1: title across the sheet.
  const [y, m] = s.month.split("-");
  const title = `  DAILY CONTRACTOR MANPOWER  DETAIL ${MONTHS[Number(m) - 1]} - ${y}`;
  for (let c = 1; c <= remarksCol; c++) put(1, c, title, { size: 11, bold: true, color: RED, fill: TITLE_FILL });
  ws.mergeCells(1, 1, 1, remarksCol);
  ws.getRow(1).height = 24;

  // Rows 2-3: contractor and department headers.
  const head = { bold: true, align: CENTER_WRAP };
  put(2, 1, "Contractor Name", { ...head, fill: CONTRACTOR_FILL, border: OPEN_RIGHT, align: CENTER });
  put(3, 1, "Department", { ...head, fill: DEPARTMENT_FILL, border: OPEN_RIGHT, align: CENTER });
  s.labels.forEach((l, i) => {
    put(2, i + 2, l.contractor, { ...head, fill: CONTRACTOR_FILL });
    put(3, i + 2, l.department, { ...head, fill: DEPARTMENT_FILL });
  });
  put(2, totalCol, "TOTAL", { ...head, fill: CONTRACTOR_FILL });
  put(2, remarksCol, "Remarks", { ...head, fill: CONTRACTOR_FILL });
  put(3, totalCol, null, { ...head, fill: DEPARTMENT_FILL });
  put(3, remarksCol, null, { ...head, fill: DEPARTMENT_FILL });
  // One contractor spanning consecutive departments is a single merged cell, as in the client file.
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && s.deployments[j + 1].contractorId === s.deployments[i].contractorId) j++;
    if (j > i) ws.mergeCells(2, i + 2, 2, j + 2);
    i = j + 1;
  }
  ws.getRow(2).height = 24;
  ws.getRow(3).height = 27.75;

  // Rows 4-5: licence and approval strength in red.
  const strength = (r: number, label: string, values: number[]) => {
    const red = { bold: true, color: RED, align: CENTER_WRAP };
    put(r, 1, label, { ...red, border: OPEN_RIGHT, align: { horizontal: "center", vertical: "top", wrapText: true } });
    values.forEach((v, i) => put(r, i + 2, v, red));
    put(r, totalCol, { formula: `SUM(B${r}:${lastData}${r})`, result: values.reduce((a, b) => a + b, 0) }, red);
    put(r, remarksCol, null, { bold: true, align: CENTER_WRAP });
    ws.getRow(r).height = 15;
  };
  strength(4, "Manpower as Per License", s.licensed);
  strength(5, "Manpower as Per Approval", s.approved);

  // One row per calendar day.
  const first = 6;
  s.days.forEach((d, i) => {
    const r = first + i;
    put(r, 1, xlDate(`${d.date}T00:00`), { bold: true, numFmt: "mm-dd-yy" });
    d.counts.forEach((c, j) => put(r, j + 2, c));
    put(r, totalCol, { formula: `SUM(B${r}:${lastData}${r})`, result: d.total ?? 0 }, { bold: true, align: CENTER_WRAP });
    put(r, remarksCol, d.remarks || null);
  });

  // TOTAL MANPOWER, through the last day of the month.
  const last = first + s.days.length - 1;
  const tot = last + 1;
  const total = { size: 10, bold: true, color: RED };
  put(tot, 1, "TOTAL MANPOWER", { ...total, border: OPEN_RIGHT, numFmt: "mm-dd-yy" });
  for (let c = 2; c <= totalCol; c++) {
    put(tot, c, { formula: `SUM(${L(c)}${first}:${L(c)}${last})`, result: c === totalCol ? s.grandTotal : s.monthTotals[c - 2] }, { ...total, align: c === totalCol ? CENTER_WRAP : CENTER });
  }
  put(tot, remarksCol, null);
  return wb;
}

export async function exportDailySummary(s: DailySummary, meta: { client: string; site: string }) {
  await download(buildDailySummary(await load(), s, meta), `Daily_Manpower_Summary_${sheetName(s.month)}.xlsx`);
}

export function buildEmployeeRows(Excel: ExcelJS, rows: EmployeeRow[], site: string) {
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet("Shift detail", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  ws.columns = [
    { header: "Employee ID", key: "id", width: 12 },
    { header: "Name", key: "name", width: 20 },
    { header: "Contractor", key: "contractor", width: 20 },
    { header: "Department", key: "department", width: 20 },
    { header: "Designation", key: "designation", width: 16 },
    { header: "Site", key: "site", width: 12 },
    { header: "Work date", key: "date", width: 11, style: { numFmt: "dd-mmm-yy" } },
    { header: "Shift", key: "shift", width: 7 },
    { header: "Scheduled IN", key: "sIn", width: 16, style: { numFmt: "dd-mmm-yy hh:mm" } },
    { header: "Scheduled OUT", key: "sOut", width: 16, style: { numFmt: "dd-mmm-yy hh:mm" } },
    { header: "Actual IN", key: "aIn", width: 16, style: { numFmt: "dd-mmm-yy hh:mm" } },
    { header: "Actual OUT", key: "aOut", width: 16, style: { numFmt: "dd-mmm-yy hh:mm" } },
    { header: "Break", key: "brk", width: 8, style: { numFmt: "[h]:mm" } },
    { header: "Net worked", key: "net", width: 10, style: { numFmt: "[h]:mm" } },
    { header: "Regular", key: "reg", width: 9, style: { numFmt: "[h]:mm" } },
    { header: "Extra duty", key: "extra", width: 10, style: { numFmt: "[h]:mm" } },
    { header: "Extra type", key: "extraType", width: 14 },
    { header: "Attendance status", key: "status", width: 16 },
    { header: "Replacement status", key: "repl", width: 16 },
    { header: "Verification", key: "ver", width: 16 },
    { header: "Exceptions", key: "remarks", width: 40 },
    { header: "Source", key: "source", width: 14 },
  ];
  const STATUS: Record<string, string> = { ABSENT: "Absent", ON_DUTY: "On duty", PRESENT: "Present", MISSING_OUT: "Missing OUT", UPCOMING: "Not started" };
  for (const r of rows) {
    const s = r.session;
    ws.addRow({
      id: r.workerId,
      name: r.name,
      contractor: r.contractor,
      department: r.department,
      designation: r.designation,
      site,
      date: xlDate(`${r.date}T00:00`),
      shift: r.shift,
      sIn: xlDate(s.sched.from),
      sOut: xlDate(s.sched.to),
      aIn: s.in ? xlDate(s.in) : null,
      aOut: s.out ? xlDate(s.out) : null,
      brk: xlDur(s.breakMins),
      net: xlDur(s.netMins),
      reg: xlDur(r.isExtraShift ? 0 : s.regularMins),
      extra: xlDur(r.extraMins),
      extraType: r.isExtraShift ? "Additional shift" : r.extraMins ? "Extension" : "",
      status: STATUS[s.status] ?? s.status,
      repl: r.replacement,
      ver: isPresent(s) ? r.verification : "",
      remarks: r.remarks,
      source: r.sources,
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = HEAD;
  ws.autoFilter = { from: "A1", to: `${colLetter(ws.columns.length)}1` };

  // Consolidated per worker per day, so several segments never double-count.
  const daily = wb.addWorksheet("Daily per employee", { views: [{ state: "frozen", ySplit: 1 }] });
  daily.columns = [
    { header: "Employee ID", key: "id", width: 12 },
    { header: "Name", key: "name", width: 20 },
    { header: "Contractor", key: "contractor", width: 20 },
    { header: "Department", key: "department", width: 20 },
    { header: "Work date", key: "date", width: 11, style: { numFmt: "dd-mmm-yy" } },
    { header: "Shifts", key: "shifts", width: 8 },
    { header: "Present", key: "present", width: 8 },
    { header: "Net worked", key: "net", width: 10, style: { numFmt: "[h]:mm" } },
    { header: "Extra duty", key: "extra", width: 10, style: { numFmt: "[h]:mm" } },
  ];
  const map = new Map<string, { r: EmployeeRow; shifts: string[]; present: boolean; net: number; extra: number }>();
  for (const r of rows) {
    const k = `${r.workerId}|${r.date}`;
    const cur = map.get(k) ?? { r, shifts: [], present: false, net: 0, extra: 0 };
    cur.shifts.push(r.shift);
    cur.present ||= isPresent(r.session);
    cur.net += r.session.netMins;
    cur.extra += r.extraMins;
    map.set(k, cur);
  }
  for (const v of map.values()) {
    daily.addRow({ id: v.r.workerId, name: v.r.name, contractor: v.r.contractor, department: v.r.department, date: xlDate(`${v.r.date}T00:00`), shifts: v.shifts.join("+"), present: v.present ? "Yes" : "No", net: xlDur(v.net), extra: xlDur(v.extra) });
  }
  daily.getRow(1).font = { bold: true };
  daily.getRow(1).fill = HEAD;
  daily.autoFilter = { from: "A1", to: "I1" };
  return wb;
}

export async function exportEmployeeRows(rows: EmployeeRow[], month: string, site: string) {
  await download(buildEmployeeRows(await load(), rows, site), `Employee_Attendance_${sheetName(month)}.xlsx`);
}

export function buildInvoiceSupport(Excel: ExcelJS, lines: InvoiceLine[], month: string, meta: { client: string; site: string }) {
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet(`Invoice support ${sheetName(month)}`);
  ws.mergeCells("A1:I1");
  ws.getCell("A1").value = `Invoice verification support · ${sheetName(month)} · ${meta.client} · ${meta.site}`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  const head = ["Contractor · Department", "Approved strength", "Manpower-days", "Verified manpower-days", "Pending verification", "Disputed", "Missing OUT", "Extra duty (h:mm)", "Unique workers"];
  ws.addRow([]);
  const hr = ws.addRow(head);
  hr.font = { bold: true };
  hr.fill = HEAD;
  for (const l of lines) {
    ws.addRow([l.label, l.approved, l.manpowerDays, l.verifiedDays, l.pendingDays, l.disputed, l.missingPunch, xlDur(l.extraMins), l.uniqueWorkers]);
  }
  const first = 4;
  const last = first + lines.length - 1;
  const total = ws.addRow(["Total", ...["B", "C", "D", "E", "F", "G", "H"].map((c) => ({ formula: `SUM(${c}${first}:${c}${last})` })), "—"]);
  total.font = { bold: true };
  ws.getColumn(8).numFmt = "[h]:mm";
  ws.getColumn(1).width = 40;
  for (let c = 2; c <= 9; c++) ws.getColumn(c).width = 16;
  ws.addRow([]);
  ws.addRow(["Manpower-days count each worker once per work date; unique workers count each person once in the month. They are different measures."]).font = { italic: true, size: 9 };
  ws.addRow(["Billing rates and invoice amounts are outside this report. Disputed and unverified records are listed for review before invoice approval."]).font = { italic: true, size: 9 };
  return wb;
}

export async function exportInvoiceSupport(lines: InvoiceLine[], month: string, meta: { client: string; site: string }) {
  await download(buildInvoiceSupport(await load(), lines, month, meta), `Invoice_Support_${sheetName(month)}.xlsx`);
}
