import { test, expect, open, latestToast } from "./fixtures";
import type { Page } from "@playwright/test";

const holidayForm = (page: Page) => page.getByRole("form", { name: "Add a holiday" });
const calendarSummary = (page: Page) => page.getByText(/^\d+ holidays? · \d+ upcoming$/);

test.describe("holidays", () => {
  test("add holiday validates empty fields and duplicate dates", async ({ page }) => {
    await open(page, "/holidays", "Holidays");
    const form = holidayForm(page);
    await form.getByRole("button", { name: "Add holiday" }).click();
    await expect(form.getByText("Choose a date.")).toBeVisible();
    await expect(form.getByText("Name the holiday.")).toBeVisible();
    await expect(form.getByLabel("Date")).toHaveAttribute("aria-invalid", "true");

    await form.getByLabel("Date").fill("2026-11-08");
    await form.getByLabel("Name").fill("Diwali second day");
    await form.getByRole("button", { name: "Add holiday" }).click();
    await expect(form.getByText("There is already a holiday on that date.")).toBeVisible();
    await expect(form.getByText("Name the holiday.")).toHaveCount(0);
    // Nothing was added: the calendar still has the six demo holidays.
    await expect(calendarSummary(page)).toHaveText("6 holidays · 1 upcoming");
    await expect(page.getByText("Diwali second day")).toHaveCount(0);
  });

  test("a holiday can be added and removed, and both changes are audited", async ({ page }) => {
    await open(page, "/holidays", "Holidays");
    const form = holidayForm(page);
    await form.getByLabel("Date").fill("2026-12-25");
    await form.getByLabel("Name").fill("Christmas");
    await form.getByRole("button", { name: "Add holiday" }).click();
    await expect(latestToast(page)).toContainText("Holiday added. Adjust the roster for that day if needed.");
    await expect(form.getByLabel("Date")).toHaveValue("");
    await expect(form.getByLabel("Name")).toHaveValue("");

    const christmas = page.getByRole("listitem").filter({ hasText: "Christmas" });
    await expect(christmas).toContainText("Fri 25 Dec");
    await expect(calendarSummary(page)).toHaveText("7 holidays · 2 upcoming");
    // Sorted by date: Christmas comes after Deepavali.
    const names = page.getByRole("listitem").locator("span.font-medium");
    await expect(names.last()).toHaveText("Christmas");

    // Survives a reload.
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: "Christmas" })).toBeVisible();

    await page.getByRole("button", { name: "Remove Christmas" }).click();
    await expect(latestToast(page)).toContainText("Christmas removed.");
    await expect(page.getByRole("listitem").filter({ hasText: "Christmas" })).toHaveCount(0);
    await expect(calendarSummary(page)).toHaveText("6 holidays · 1 upcoming");

    await open(page, "/audit", "Audit log");
    await expect(page.getByText("2 entries")).toBeVisible();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2);
    // Newest first.
    await expect(rows.nth(0)).toContainText("holiday/remove");
    await expect(rows.nth(0)).toContainText("Removed holiday Christmas on 2026-12-25");
    await expect(rows.nth(1)).toContainText("holiday/add");
    await expect(rows.nth(1)).toContainText("Added holiday Christmas on 2026-12-25");
    await expect(rows.nth(1)).toContainText("Plant HR");
  });
});

test.describe("settings", () => {
  const minRest = (page: Page) => page.getByLabel("Minimum rest between duties (hours)", { exact: true });
  const weeklyMode = (page: Page) => page.getByRole("radiogroup", { name: "Maximum hours in 7 days: when broken" });

  test("shows every settings section", async ({ page }) => {
    await open(page, "/settings", "Settings");
    for (const name of ["Working-time policy", "Counting rules", "Attendance sources", "Permission matrix", "Demo data"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    // The matrix reflects the real rules, e.g. only client admins and auditors see the audit log.
    const audit = page.getByRole("row", { name: /View audit log/ });
    await expect(audit.getByText("Allowed", { exact: true })).toHaveCount(2);
    await expect(audit.getByText("Not allowed", { exact: true })).toHaveCount(3);
  });

  test("policy is validated, saved and kept after reload", async ({ page }) => {
    await open(page, "/settings", "Settings");
    await expect(minRest(page)).toHaveValue("8");
    await expect(weeklyMode(page).getByRole("radio", { name: "Warn" })).toHaveAttribute("aria-checked", "true");

    await minRest(page).fill("99");
    await page.getByRole("button", { name: "Save policy" }).click();
    await expect(page.getByText("Between 0 and 24.")).toBeVisible();
    await expect(minRest(page)).toHaveAttribute("aria-invalid", "true");

    await minRest(page).fill("9");
    await weeklyMode(page).getByRole("radio", { name: "Block" }).click();
    await expect(weeklyMode(page).getByRole("radio", { name: "Block" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Save policy" }).click();
    await expect(latestToast(page)).toContainText("Policy saved. Checks and lateness use it from now.");
    await expect(page.getByText("Between 0 and 24.")).toHaveCount(0);

    await page.reload();
    await expect(minRest(page)).toHaveValue("9");
    await expect(weeklyMode(page).getByRole("radio", { name: "Block" })).toHaveAttribute("aria-checked", "true");
    await expect(weeklyMode(page).getByRole("radio", { name: "Warn" })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("1 change saved in this browser.", { exact: false })).toBeVisible();
  });

  test("reset demo data asks for confirmation and restores the defaults", async ({ page }) => {
    await open(page, "/settings", "Settings");
    await minRest(page).fill("9");
    await weeklyMode(page).getByRole("radio", { name: "Block" }).click();
    await page.getByRole("button", { name: "Save policy" }).click();
    await expect(latestToast(page)).toContainText("Policy saved.");
    await expect(page.getByText("1 change saved in this browser.", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Reset demo data" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "This can't be undone." })).toBeVisible();
    // Backing out keeps the change.
    await page.getByRole("button", { name: "Keep my changes" }).click();
    await expect(page.getByText("1 change saved in this browser.", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Reset demo data" }).click();
    await page.getByRole("button", { name: "Yes, reset everything" }).click();
    await expect(latestToast(page)).toContainText("Demo data reset.");
    await expect(page.getByText("0 changes saved in this browser.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset demo data" })).toBeVisible();

    await page.reload();
    await expect(minRest(page)).toHaveValue("8");
    await expect(weeklyMode(page).getByRole("radio", { name: "Warn" })).toHaveAttribute("aria-checked", "true");
    await open(page, "/audit", "Audit log");
    await expect(page.getByText("No changes yet")).toBeVisible();
  });

  // Regression: the form used to keep the old values after a reset until a reload, and Save re-applied them.
  test("after a reset the policy form shows the defaults without a reload", async ({ page }) => {
    await open(page, "/settings", "Settings");
    await minRest(page).fill("9");
    await weeklyMode(page).getByRole("radio", { name: "Block" }).click();
    await page.getByRole("button", { name: "Save policy" }).click();
    await expect(latestToast(page)).toContainText("Policy saved.");

    await page.getByRole("button", { name: "Reset demo data" }).click();
    await page.getByRole("button", { name: "Yes, reset everything" }).click();
    await expect(page.getByText("0 changes saved in this browser.", { exact: false })).toBeVisible();

    await expect(minRest(page)).toHaveValue("8", { timeout: 3000 });
    await expect(weeklyMode(page).getByRole("radio", { name: "Warn" })).toHaveAttribute("aria-checked", "true", { timeout: 3000 });
  });
});
