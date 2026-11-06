import type { Page } from "@playwright/test";
import { test, expect, open, viewAs, latestToast } from "./fixtures";

type Viewer = Parameters<typeof viewAs>[1];

const AUDITOR: Viewer = { role: "AUDITOR", name: "Auditor" };
const ACCOUNTS: Viewer = { role: "ACCOUNTS", name: "Accounts" };
const SUPERVISOR: Viewer = { role: "CLIENT_SUPERVISOR", name: "Shift supervisor" };
const POOJA: Viewer = { role: "CONTRACTOR_ADMIN", name: "Pooja Agencies admin", contractorId: "c-pooja" };

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const minRest = (page: Page) => page.getByLabel("Minimum rest between duties (hours)", { exact: true });

/** Holidays and the working-time policy are client-admin only. */
async function expectHolidaysAndSettingsReadOnly(page: Page) {
  await open(page, "/holidays", "Holidays");
  await expect(page.getByRole("note").filter({ hasText: "Holidays are maintained by the client admin." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add holiday" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove Deepavali" })).toHaveCount(0);
  await expect(page.getByText("Deepavali")).toBeVisible();

  await open(page, "/settings", "Settings");
  await expect(page.getByRole("note").filter({ hasText: "Only the client admin can change the policy." })).toBeVisible();
  await expect(minRest(page)).toBeDisabled();
  await expect(page.getByLabel("Late grace (minutes)")).toBeDisabled();
  await expect(page.getByRole("radiogroup", { name: "Maximum hours in 7 days: when broken" }).getByRole("radio", { name: "Block" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save policy" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Demo data" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset demo data" })).toHaveCount(0);
}

/** The roster can be seen but not changed. */
async function expectRosterReadOnly(page: Page, worker: string) {
  await open(page, "/roster", "Roster");
  await expect(page.getByRole("note").filter({ hasText: "Only client admins and supervisors can change the roster." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set D" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: new RegExp(`^${worker} Sat 7 Nov:`) })).toBeDisabled();
}

/** Workers are listed and open, but nothing can be added or changed. */
async function expectWorkersReadOnly(page: Page) {
  // The hash opens the worker's sheet on load (a modal, so the page title behind it is hidden from the a11y tree).
  await page.goto("/workers#MAY-0001");
  const sheet = page.getByRole("dialog", { name: "MAY-0001" });
  await expect(sheet.getByText("Ramesh A")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Edit details" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Record transfer" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Workers" })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "Workers are added and updated by the client admin and their contractor." })).toBeVisible();
  await expect(page.getByText(/^179 active workers\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add worker" })).toHaveCount(0);
}

/** Contractors and their strengths are client-admin only. */
async function expectContractorsReadOnly(page: Page) {
  await open(page, "/contractors", "Contractors");
  await expect(page.getByRole("note").filter({ hasText: "Licensed and approved strengths are maintained by the client admin." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Mayfair Consultancy/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add contractor" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Edit details of / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Change strength for/ })).toHaveCount(0);
}

async function expectShiftsReadOnly(page: Page) {
  await open(page, "/shifts", "Shifts");
  await expect(page.getByRole("note").filter({ hasText: "Only client admins and supervisors can create or change shifts." })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Day 12h/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "New shift" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Edit|Deactivate) shift / })).toHaveCount(0);
}

async function expectDevicesReadOnly(page: Page) {
  await open(page, "/devices", "Devices");
  await expect(page.getByRole("note").filter({ hasText: "Devices are managed by the client admin." })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Face device 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add device" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Edit|Disable) device / })).toHaveCount(0);
}

for (const [label, viewer, seesAudit] of [
  ["auditor", AUDITOR, true],
  ["accounts reviewer", ACCOUNTS, false],
] as const) {
  test.describe(label, () => {
    test.beforeEach(async ({ page }) => {
      await viewAs(page, viewer);
    });

    test(`audit log access matches the matrix (${seesAudit ? "allowed" : "hidden"})`, async ({ page }) => {
      await open(page, "/", "Dashboard");
      await expect(page.getByRole("button", { name: `Viewing as ${viewer.name}. Change role` })).toBeVisible();
      await expect(nav(page).getByRole("link", { name: "Reports" })).toBeVisible();
      await expect(nav(page).getByRole("link", { name: "Audit log" })).toHaveCount(seesAudit ? 1 : 0);

      await open(page, "/audit", "Audit log");
      if (seesAudit) {
        await expect(page.getByLabel("Search", { exact: true })).toBeVisible();
        await expect(page.getByText("No changes yet")).toBeVisible();
      } else {
        await expect(page.getByText("Not available for this role")).toBeVisible();
        await expect(page.getByLabel("Search", { exact: true })).toHaveCount(0);
      }
    });

    test("operations, roster and the masters are read-only", async ({ page }) => {
      await open(page, "/extra-duty", "Extra duty");
      await expect(page.getByText(/\d+ requests?, newest first/)).toBeVisible();
      await expect(page.getByRole("button", { name: "New extra duty" })).toHaveCount(0);

      await expectRosterReadOnly(page, "MAY-0001");
      await expectWorkersReadOnly(page);
      await expectContractorsReadOnly(page);
      await expectShiftsReadOnly(page);
      await expectDevicesReadOnly(page);
    });

    test("holidays and settings are read-only", async ({ page }) => {
      await expectHolidaysAndSettingsReadOnly(page);
    });

    test("reports can still be downloaded", async ({ page }) => {
      await open(page, "/reports", "Reports");
      await expect(page.getByText("Your role can view but not download reports.")).toHaveCount(0);
      const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download daily summary" }).click()]);
      expect(file.suggestedFilename()).toBe("Daily_Manpower_Summary_NOV_2026.xlsx");
      await expect(latestToast(page)).toContainText("daily summary downloaded.");
    });
  });
}

test.describe("client supervisor", () => {
  test.beforeEach(async ({ page }) => {
    await viewAs(page, SUPERVISOR);
  });

  test("can start an extra-duty request for approval", async ({ page }) => {
    await open(page, "/", "Dashboard");
    await expect(nav(page).getByRole("link", { name: "Audit log" })).toHaveCount(0);

    await open(page, "/extra-duty", "Extra duty");
    await page.getByRole("button", { name: "New extra duty" }).click();
    const sheet = page.getByRole("dialog", { name: "New extra duty" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Submit for approval" })).toBeVisible();
    // A client supervisor picks from every contractor's workers.
    await expect(sheet.getByLabel("Worker").locator("optgroup")).toHaveCount(9);
  });

  test("can change the roster", async ({ page }) => {
    await open(page, "/roster", "Roster");
    await expect(page.getByRole("note").filter({ hasText: "Only client admins and supervisors can change the roster." })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Set N" })).toBeDisabled();

    await page.getByRole("button", { name: /^MAY-0001 Sat 7 Nov:/ }).click();
    await expect(page.getByText("1 cell selected")).toBeVisible();
    await page.getByRole("button", { name: "Set N" }).click();
    await expect(latestToast(page)).toContainText("1 roster cell set to N.");
    await expect(page.getByRole("button", { name: /^MAY-0001 Sat 7 Nov: N/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: /^MAY-0001 Sat 7 Nov: N/ })).toBeVisible();
  });

  test("can change shifts, but not devices, contractors or workers", async ({ page }) => {
    await open(page, "/shifts", "Shifts");
    await expect(page.getByRole("note")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New shift" })).toBeVisible();
    await page.getByRole("button", { name: "Edit shift G" }).click();
    const sheet = page.getByRole("dialog", { name: "Edit shift G" });
    await sheet.getByLabel("Name", { exact: true }).fill("General 9h");
    await sheet.getByRole("button", { name: "Save changes" }).click();
    await expect(latestToast(page)).toContainText("Shift G updated.");
    await expect(page.getByRole("cell", { name: /General 9h/ })).toBeVisible();

    await expectDevicesReadOnly(page);
    await expectContractorsReadOnly(page);
    await expectWorkersReadOnly(page);
  });

  test("cannot change holidays or settings", async ({ page }) => {
    await expectHolidaysAndSettingsReadOnly(page);
  });
});

test.describe("contractor admin (Pooja Agencies)", () => {
  test.beforeEach(async ({ page }) => {
    await viewAs(page, POOJA);
  });

  test("can request extra duty for their own workers only", async ({ page }) => {
    await open(page, "/extra-duty", "Extra duty");
    await page.getByRole("button", { name: "New extra duty" }).click();
    const sheet = page.getByRole("dialog", { name: "New extra duty" });
    await expect(sheet.getByRole("button", { name: "Send request" })).toBeVisible();
    const workers = sheet.getByLabel("Worker").locator("optgroup option");
    await expect(workers).toHaveCount(40);
    for (const text of await workers.allTextContents()) expect(text).toMatch(/^POO-\d{4} · /);
  });

  test("sees only Pooja workers and can add one to Pooja's deployment only", async ({ page }) => {
    await open(page, "/workers", "Workers");
    await expect(page.getByText("Contractor view: only Pooja Agencies workers and reports are visible.")).toBeVisible();
    await expect(page.getByText(/^40 active workers\./)).toBeVisible();
    const ids = page.getByRole("table").getByRole("row").filter({ has: page.getByRole("cell") }).locator("td:first-child");
    await expect(ids).toHaveCount(40);
    for (const id of await ids.allTextContents()) expect(id).toMatch(/^POO-\d{4}$/);
    await expect(page.getByRole("combobox", { name: "Deployment" }).locator("option")).toHaveText(["All deployments", "Pooja Agencies · Packing & Dispatch"]);

    await page.getByRole("button", { name: "Add worker" }).click();
    const sheet = page.getByRole("dialog", { name: "Add worker" });
    await expect(sheet.getByLabel("Deployment").locator("option")).toHaveText(["Pooja Agencies · Packing & Dispatch"]);
    await expect(sheet.getByLabel("Employee code")).toHaveValue("POO-0541");
    await expect(sheet.getByRole("button", { name: "Add worker" })).toBeEnabled();
  });

  test("cannot change shifts, devices or contractors", async ({ page }) => {
    await expectShiftsReadOnly(page);
    await expectDevicesReadOnly(page);

    await open(page, "/contractors", "Contractors");
    await expect(page.getByRole("note").filter({ hasText: "Licensed and approved strengths are maintained by the client admin." })).toBeVisible();
    // Only their own contractor is listed.
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Pooja Agencies");
    await expect(page.getByRole("button", { name: "Add contractor" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit details of / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Change strength for/ })).toHaveCount(0);
  });

  test("roster is read-only", async ({ page }) => {
    await expectRosterReadOnly(page, "POO-0501");
    await expect(page.getByLabel("Deployment").locator("option")).toHaveText(["Pooja Agencies · Packing & Dispatch"]);
  });
});
