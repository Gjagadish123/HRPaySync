import type { Page } from "@playwright/test";
import { expect, latestToast, open, test } from "./fixtures";

// Default deployment's week of Mon 2 – Sun 8 Nov; "today" is Thu 5 Nov, 12:00 (D started, N not yet).
const cell = (page: Page, worker: string, day: string) => page.getByRole("button", { name: new RegExp(`^${worker} ${day}:`) });
const setButton = (page: Page, code: string) => page.getByRole("button", { name: `Set ${code}`, exact: true });
const navExpect = expect.configure({ timeout: 30_000 });

test("Set D on two selected future cells updates them, survives reload and is audited", async ({ page }) => {
  await open(page, "/roster", "Roster");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roster");
  await expect(page).toHaveTitle(/^Roster · /);
  await expect(setButton(page, "D")).toBeDisabled();
  await expect(setButton(page, "rest")).toBeDisabled();

  const a = cell(page, "MAY-0001", "Sun 8 Nov");
  const b = cell(page, "MAY-0005", "Sun 8 Nov");
  await expect(a).toHaveAttribute("aria-label", "MAY-0001 Sun 8 Nov: rest");
  await expect(b).toHaveAttribute("aria-label", "MAY-0005 Sun 8 Nov: rest");
  await a.click();
  await b.click();
  await expect(a).toHaveAttribute("aria-pressed", "true");
  await expect(b).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("2 cells selected")).toBeVisible();

  await setButton(page, "D").click();
  await expect(latestToast(page)).toContainText("2 roster cells set to D.");
  await expect(a).toHaveAttribute("aria-label", /^MAY-0001 Sun 8 Nov: D/);
  await expect(b).toHaveAttribute("aria-label", /^MAY-0005 Sun 8 Nov: D/);
  await expect(a).toHaveAttribute("aria-pressed", "false");
  await expect(setButton(page, "D")).toBeDisabled();

  await page.reload();
  await expect(a).toHaveAttribute("aria-label", /^MAY-0001 Sun 8 Nov: D/);
  await expect(b).toHaveAttribute("aria-label", /^MAY-0005 Sun 8 Nov: D/);

  await open(page, "/audit", "Audit log");
  await expect(page.getByRole("cell", { name: "Roster: set 2 cells to D" })).toBeVisible();
});

test("a day shift straight after a night shift is flagged for zero rest", async ({ page }) => {
  await open(page, "/roster", "Roster");
  await expect(cell(page, "MAY-0002", "Fri 6 Nov")).toHaveAttribute("aria-label", "MAY-0002 Fri 6 Nov: N");
  const sat = cell(page, "MAY-0002", "Sat 7 Nov");
  await expect(sat).toHaveAttribute("aria-label", "MAY-0002 Sat 7 Nov: N");

  await sat.click();
  await setButton(page, "D").click();
  await expect(latestToast(page)).toContainText("1 roster cell set to D.");
  await expect(sat).toHaveAttribute("aria-label", /^MAY-0002 Sat 7 Nov: D, .*Only 0m rest before this shift/);
  await expect(sat).toHaveAttribute("title", "Only 0m rest before this shift");
});

test("past days and started day shifts are locked, tonight's night shift is not", async ({ page }) => {
  await open(page, "/roster", "Roster");

  const past = cell(page, "MAY-0001", "Wed 4 Nov");
  await expect(past).toBeDisabled();
  await expect(past).toHaveAttribute("title", "Past day, locked");

  const startedDay = cell(page, "MAY-0001", "Thu 5 Nov");
  await expect(startedDay).toHaveAttribute("aria-label", "MAY-0001 Thu 5 Nov: D");
  await expect(startedDay).toBeDisabled();
  await expect(startedDay).toHaveAttribute("title", "Shift already started, locked");

  const tonight = cell(page, "MAY-0002", "Thu 5 Nov");
  await expect(tonight).toHaveAttribute("aria-label", "MAY-0002 Thu 5 Nov: N");
  await expect(tonight).toBeEnabled();
  await tonight.click();
  await expect(tonight).toHaveAttribute("aria-pressed", "true");
  await expect(setButton(page, "N")).toBeEnabled();
});

test("Set rest on a future cell removes its shift", async ({ page }) => {
  await open(page, "/roster", "Roster");
  const fri = cell(page, "MAY-0001", "Fri 6 Nov");
  await expect(fri).toHaveAttribute("aria-label", /^MAY-0001 Fri 6 Nov: D/);

  await fri.click();
  await setButton(page, "rest").click();
  await expect(latestToast(page)).toContainText("1 roster cell set to rest.");
  await expect(fri).toHaveAttribute("aria-label", /: rest$/);
});

test("week navigation moves the header dates and This week returns", async ({ page }) => {
  await open(page, "/roster", "Roster");
  const week = page.getByRole("group", { name: "Week" });
  const thisWeek = page.getByRole("button", { name: "This week" });
  await expect(week).toContainText("2 Nov – 8 Nov");
  await expect(page.getByRole("columnheader", { name: /Thu · Today/ })).toContainText("5 Nov");
  await expect(thisWeek).toBeDisabled();

  await page.getByRole("button", { name: "Next week" }).click();
  await expect(week).toContainText("9 Nov – 15 Nov");
  await expect(page.getByRole("columnheader", { name: /Mon/ })).toContainText("9 Nov");
  await expect(page.getByRole("columnheader", { name: /Today/ })).toHaveCount(0);
  await expect(cell(page, "MAY-0001", "Mon 9 Nov")).toBeEnabled();

  await page.getByRole("button", { name: "Previous week" }).click();
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(week).toContainText("26 Oct – 1 Nov");
  await expect(cell(page, "MAY-0001", "Sun 1 Nov")).toBeDisabled();

  await thisWeek.click();
  await expect(week).toContainText("2 Nov – 8 Nov");
  await expect(thisWeek).toBeDisabled();
});

test("shift templates are managed on Shifts, linked from the roster toolbar", async ({ page }) => {
  await open(page, "/roster", "Roster");
  // The old inline template form is gone; the toolbar links to the Shifts screen instead.
  await expect(page.getByRole("form", { name: "New shift template" })).toHaveCount(0);
  const manage = page.getByRole("link", { name: "Manage shifts" });
  await expect(manage).toHaveAttribute("href", "/shifts");
  await manage.click();
  await navExpect(page).toHaveURL(/\/shifts$/);
  await navExpect(page.getByRole("heading", { level: 1, name: "Shifts" })).toBeVisible();
});

test("a shift that has already started today can't be rostered; the cell and selection stay", async ({ page }) => {
  await open(page, "/roster", "Roster");
  // Tonight's N shift has not started, so the cell is open, but D started at 08:00 today.
  const tonight = cell(page, "MAY-0002", "Thu 5 Nov");
  await expect(tonight).toHaveAttribute("aria-label", "MAY-0002 Thu 5 Nov: N");
  await tonight.click();
  await setButton(page, "D").click();
  await expect(latestToast(page)).toContainText("Shift D on 2026-11-05 has already started, so it can't be rostered now.");
  await expect(tonight).toHaveAttribute("aria-label", "MAY-0002 Thu 5 Nov: N");
  await expect(tonight).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 cell selected")).toBeVisible();

  // Tonight's own shift is still fine.
  await setButton(page, "N").click();
  await expect(latestToast(page)).toContainText("1 roster cell set to N.");
  await page.reload();
  await expect(tonight).toHaveAttribute("aria-label", "MAY-0002 Thu 5 Nov: N");
  await open(page, "/audit", "Audit log");
  await expect(page.getByRole("cell", { name: "Roster: set 1 cell to D" })).toHaveCount(0);
});

test("an inactive worker is locked in weeks they still hold shifts and left out of the rest", async ({ page }) => {
  await page.goto("/workers#MAY-0003");
  const sheet = page.getByRole("dialog", { name: "MAY-0003" });
  await sheet.getByRole("button", { name: "Deactivate" }).click();
  await expect(latestToast(page)).toContainText("Worker deactivated. Their records stay.");

  await open(page, "/roster", "Roster");
  const name = page.getByRole("cell").filter({ hasText: /^MAY-0003/ });
  // This week they worked before today, so the row stays, read-only, and their shifts from today on are gone.
  await expect(name).toContainText("Inactive");
  for (const day of ["Mon 2 Nov", "Sat 7 Nov", "Sun 8 Nov"]) {
    await expect(cell(page, "MAY-0003", day)).toBeDisabled();
    await expect(cell(page, "MAY-0003", day)).toHaveAttribute("title", "Inactive worker");
  }
  await expect(cell(page, "MAY-0003", "Sat 7 Nov")).toHaveAttribute("aria-label", "MAY-0003 Sat 7 Nov: rest");
  await expect(cell(page, "MAY-0001", "Sat 7 Nov")).toBeEnabled();

  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByRole("group", { name: "Week" })).toContainText("9 Nov – 15 Nov");
  await expect(cell(page, "MAY-0001", "Mon 9 Nov")).toBeEnabled();
  await expect(page.getByRole("button", { name: /^MAY-0003 / })).toHaveCount(0);
});
