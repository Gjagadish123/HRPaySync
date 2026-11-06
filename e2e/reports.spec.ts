import ExcelJS from "exceljs";
import type { Page } from "@playwright/test";
import { test, expect, open, latestToast } from "./fixtures";

const TABS = [
  { tab: "Daily manpower summary", button: "Download daily summary", file: "Daily_Manpower_Summary" },
  { tab: "Employee-wise attendance", button: "Download employee report", file: "Employee_Attendance" },
  { tab: "Invoice support", button: "Download invoice support", file: "Invoice_Support" },
] as const;

async function download(page: Page, button: string) {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button }).click()]);
  return file;
}

test("daily tab explains the red threshold and lists both months", async ({ page }) => {
  await open(page, "/reports", "Reports");
  await expect(page.getByRole("tab", { name: "Daily manpower summary" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Counts below 80% of approved strength are shown in red.", { exact: false })).toBeVisible();
  const month = page.getByLabel("Month");
  await expect(month).toHaveValue("2026-11");
  await expect(month.locator("option")).toHaveText(["Oct 2026", "Nov 2026"]);
  await expect(page.getByRole("heading", { level: 2, name: "Daily contractor manpower · Nov 2026" })).toBeVisible();

  await month.selectOption({ label: "Oct 2026" });
  await expect(page.getByRole("heading", { level: 2, name: "Daily contractor manpower · Oct 2026" })).toBeVisible();
  await expect(page.getByText("sheet OCT_2026", { exact: false })).toBeVisible();
});

test("each report downloads an .xlsx named for the chosen month", async ({ page }) => {
  await open(page, "/reports", "Reports");
  for (const [label, code] of [["Oct 2026", "OCT_2026"], ["Nov 2026", "NOV_2026"]] as const) {
    await page.getByLabel("Month").selectOption({ label });
    for (const t of TABS) {
      await page.getByRole("tab", { name: t.tab }).click();
      await expect(page.getByRole("tab", { name: t.tab })).toHaveAttribute("aria-selected", "true");
      const file = await download(page, t.button);
      expect(file.suggestedFilename()).toBe(`${t.file}_${code}.xlsx`);
      await expect(latestToast(page)).toContainText(`${t.button.replace("Download ", "")} downloaded.`);
      await expect(page.getByRole("button", { name: t.button })).toBeEnabled();
    }
  }
});

test("October daily summary matches the client's workbook layout", async ({ page }) => {
  await open(page, "/reports", "Reports");
  await page.getByLabel("Month").selectOption({ label: "Oct 2026" });
  const file = await download(page, "Download daily summary");
  expect(file.suggestedFilename()).toBe("Daily_Manpower_Summary_OCT_2026.xlsx");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await file.path());
  expect(wb.worksheets.map((w) => w.name)).toEqual(["OCT_2026"]);
  const ws = wb.getWorksheet("OCT_2026")!;
  const fill = (addr: string) => (ws.getCell(addr).fill as ExcelJS.FillPattern).fgColor?.argb;

  // Title row.
  const a1 = ws.getCell("A1");
  expect(a1.value).toBe("  DAILY CONTRACTOR MANPOWER  DETAIL OCTOBER - 2026");
  expect(a1.font.name).toBe("Times New Roman");
  expect(a1.font.bold).toBe(true);
  expect(a1.font.color?.argb).toBe("FFFF0000");
  expect(fill("A1")).toBe("FFFBE5D6");
  expect([...ws.model.merges].sort()).toEqual(["A1:L1", "C2:F2"]);

  // Contractor and department header rows.
  expect(ws.getCell("A2").value).toBe("Contractor Name");
  expect(ws.getCell("K2").value).toBe("TOTAL");
  expect(ws.getCell("L2").value).toBe("Remarks");
  for (const c of ["A2", "B2", "C2", "K2", "L2"]) expect(fill(c), c).toBe("FFBDD7EE");
  expect(ws.getCell("B2").value).toBe("Mayfair Consultancy");
  expect(ws.getCell("C2").value).toBe("SRI VENKATARAMANA MANAGEMENTS (SVM)");
  expect(ws.getCell("A3").value).toBe("Department");
  for (const c of ["A3", "B3", "F3", "J3", "K3", "L3"]) expect(fill(c), c).toBe("FFFFF2CC");

  // Licence and approval rows with SUM totals.
  const row = (r: number) => ["B", "C", "D", "E", "F", "G", "H", "I", "J"].map((c) => ws.getCell(`${c}${r}`).value);
  expect(ws.getCell("A4").value).toBe("Manpower as Per License");
  expect(row(4)).toEqual([30, 10, 25, 20, 5, 40, 20, 20, 15]);
  expect(ws.getCell("K4").formula).toBe("SUM(B4:J4)");
  expect(ws.getCell("A5").value).toBe("Manpower as Per Approval");
  expect(row(5)).toEqual([25, 8, 20, 15, 5, 35, 18, 17, 12]);
  expect(ws.getCell("K5").formula).toBe("SUM(B5:J5)");

  // One row per calendar day from 1 Oct, then the month total.
  const a6 = ws.getCell("A6");
  expect(a6.value).toBeInstanceOf(Date);
  expect((a6.value as Date).toISOString().slice(0, 10)).toBe("2026-10-01");
  expect(a6.numFmt).toBe("mm-dd-yy");
  expect((ws.getCell("A36").value as Date).toISOString().slice(0, 10)).toBe("2026-10-31");
  expect(ws.getCell("K6").formula).toBe("SUM(B6:J6)");
  expect(ws.getCell("A37").value).toBe("TOTAL MANPOWER");
  expect(ws.getCell("B37").formula).toBe("SUM(B6:B36)");
  expect(ws.getCell("K37").formula).toBe("SUM(K6:K36)");

  // Column width and header row heights copied from the client file.
  expect(ws.getColumn(1).width).toBe(21.140625);
  expect([1, 2, 3].map((r) => ws.getRow(r).height)).toEqual([24, 24, 27.75]);
});
