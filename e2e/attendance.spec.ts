import type { Page } from "@playwright/test";
import { expect, latestToast, open, test } from "./fixtures";

// Yesterday's shifts are all finished, so every action (dispute, verify, manual punch) is available.
const DAY = "2026-11-04";
const summary = (page: Page) => page.getByText(/\d+ shifts? · /);

/** Open the attendance list for DAY and the detail sheet of the first row (JAG-0601, D shift). */
async function openFirstShift(page: Page) {
  await open(page, `/attendance?date=${DAY}`, "Attendance");
  await page.getByRole("button", { name: /^[A-Z]{3}-\d{4}/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "D shift · Wed 4 Nov" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Punches" })).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Verification" })).toBeVisible();
  return sheet;
}

test("work date filter loads that day and opens a shift sheet with its actions", async ({ page }) => {
  // The page opens on the monthly register (~5,500 day cells, slower to build); the daily list is the other view.
  await page.goto("/attendance");
  await expect(page.getByRole("heading", { level: 1, name: "Attendance" })).toBeVisible({ timeout: 30_000 });
  const views = page.getByRole("radiogroup", { name: "Attendance view" });
  await expect(views.getByRole("radio", { name: "Monthly register" })).toHaveAttribute("aria-checked", "true");
  await views.getByRole("radio", { name: "Daily list" }).click();
  await expect(views.getByRole("radio", { name: "Daily list" })).toHaveAttribute("aria-checked", "true");
  await expect(page).toHaveURL(/[?&]view=list/);

  await page.getByLabel("Work date").fill(DAY);
  await expect(summary(page)).toHaveText(/^154 shifts · /);
  await page.getByRole("button", { name: /^[A-Z]{3}-\d{4}/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "D shift · Wed 4 Nov" });
  for (const name of ["Add missed punch", "Verify presence", "Dispute"]) {
    await expect(sheet.getByRole("button", { name, exact: true })).toBeVisible();
  }
});

test("a dispute needs a note, is raised, then resolved", async ({ page }) => {
  const sheet = await openFirstShift(page);

  await sheet.getByRole("button", { name: "Dispute", exact: true }).click();
  await sheet.getByRole("button", { name: "Dispute", exact: true }).click(); // submit with an empty note
  await expect(sheet.getByText("Write at least 5 characters so the other party knows what to fix.")).toBeVisible();

  await sheet.getByLabel("Dispute").fill("Not at station after 16:00");
  await sheet.getByRole("button", { name: "Dispute", exact: true }).click();
  await expect(latestToast(page)).toContainText("Dispute raised. Both sides' notes are kept.");
  await expect(sheet.getByText("Disputed", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Not at station after 16:00")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Dispute", exact: true })).toHaveCount(0);

  await sheet.getByRole("button", { name: "Resolve dispute" }).click();
  await sheet.getByLabel("Resolve dispute").fill("Accepted: worker was on stores dock");
  await sheet.getByRole("button", { name: "Resolve dispute" }).click();
  await expect(latestToast(page)).toContainText("Dispute resolved.");
  await expect(sheet.getByText("Dispute resolved", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Accepted: worker was on stores dock")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Resolve dispute" })).toHaveCount(0);
});

test("verify presence marks the shift verified in the sheet and the list", async ({ page }) => {
  const sheet = await openFirstShift(page);
  await expect(summary(page)).toContainText("143 not verified");

  await sheet.getByRole("button", { name: "Verify presence" }).click();
  await expect(latestToast(page)).toContainText("Attendance verified.");
  await expect(sheet.getByText("Verified", { exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Verify presence" })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("row", { name: /JAG-0601/ }).getByText("Verified", { exact: true })).toBeVisible();
  await expect(summary(page)).toContainText("142 not verified");
});

test("a missed punch is validated, added as MANUAL and kept after reload", async ({ page }) => {
  let sheet = await openFirstShift(page);
  await sheet.getByRole("button", { name: "Add missed punch" }).click();
  const submit = sheet.getByRole("button", { name: "Add manual punch" });

  await submit.click();
  await expect(sheet.getByText("Give a reason of at least 5 characters (e.g. 'Device FD-1 offline').")).toBeVisible();
  await expect(sheet.getByText("Name the approving person.")).toBeVisible();

  await sheet.getByLabel("Punch date and time").fill("2026-11-01T08:00");
  await sheet.getByLabel("Reason").fill("Device FD-1 offline");
  await sheet.getByLabel("Approved by").fill("R. Kulkarni");
  await submit.click();
  await expect(sheet.getByText(/^Must fall within this shift's window/)).toBeVisible();
  await expect(sheet.getByText("Name the approving person.")).toHaveCount(0);

  await sheet.getByLabel("Punch date and time").fill(`${DAY}T13:30`);
  await submit.click();
  await expect(latestToast(page)).toContainText("Manual punch added. The original device events are unchanged.");
  await expect(submit).toHaveCount(0);
  const manual = sheet.getByRole("listitem").filter({ hasText: "4 Nov 13:30" });
  await expect(manual.getByText("MANUAL", { exact: true })).toBeVisible();
  await expect(manual).toContainText("Manual: Device FD-1 offline · approved by R. Kulkarni");

  await page.reload();
  sheet = await openFirstShift(page);
  await expect(sheet.getByRole("listitem").filter({ hasText: "4 Nov 13:30" }).getByText("MANUAL", { exact: true })).toBeVisible();
});

test("bulk verify ticks three rows and verifies them together", async ({ page }) => {
  await open(page, `/attendance?date=${DAY}`, "Attendance");
  const verify = page.getByRole("button", { name: /^Verify selected/ });
  await expect(verify).toBeDisabled();

  const ids = ["JAG-0601", "JAG-0602", "JAG-0603"];
  for (const id of ids) await page.getByRole("checkbox", { name: `Select ${id} on ${DAY}` }).click();
  await expect(verify).toHaveText("Verify selected (3)");
  await verify.click();

  await expect(latestToast(page)).toContainText("3 records verified.");
  await expect(verify).toBeDisabled();
  for (const id of ids) await expect(page.getByRole("row", { name: new RegExp(id) }).getByText("Verified", { exact: true })).toBeVisible();
  await expect(summary(page)).toContainText("140 not verified");
});

test("bulk verify reaches only selected rows still listed and selectable; a filter change clears the selection", async ({ page }) => {
  await open(page, `/attendance?date=${DAY}`, "Attendance");
  const verify = page.getByRole("button", { name: /^Verify selected/ });
  const box = (id: string) => page.getByRole("checkbox", { name: `Select ${id} on ${DAY}` });
  const row = (id: string) => page.getByRole("row", { name: new RegExp(id) });

  // A filter change drops the selection, even for rows that are still listed.
  await box("JAG-0601").click();
  await box("JAG-0602").click();
  await expect(verify).toHaveText("Verify selected (2)");
  await page.getByRole("searchbox", { name: "Worker" }).fill("JAG-060");
  await expect(summary(page)).not.toHaveText(/^154 shifts/);
  await expect(box("JAG-0601")).not.toBeChecked();
  await expect(verify).toBeDisabled();
  await expect(verify).toHaveText("Verify selected");
  await page.getByRole("searchbox", { name: "Worker" }).fill("");
  await expect(summary(page)).toHaveText(/^154 shifts · /);
  await expect(box("JAG-0602")).not.toBeChecked();
  await expect(verify).toBeDisabled();

  // A selected shift that goes under dispute drops out of the bulk action.
  for (const id of ["JAG-0601", "JAG-0602", "JAG-0603"]) await box(id).click();
  await expect(verify).toHaveText("Verify selected (3)");
  await row("JAG-0602").getByRole("button", { name: /^JAG-0602/ }).click();
  const sheet = page.getByRole("dialog", { name: /shift · Wed 4 Nov$/ });
  await sheet.getByRole("button", { name: "Dispute", exact: true }).click();
  await sheet.getByLabel("Dispute").fill("Left the post early");
  await sheet.getByRole("button", { name: "Dispute", exact: true }).click();
  await expect(latestToast(page)).toContainText("Dispute raised.");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(box("JAG-0602")).toBeDisabled();
  await expect(box("JAG-0602")).not.toBeChecked();
  await expect(verify).toHaveText("Verify selected (2)");

  await verify.click();
  await expect(latestToast(page)).toContainText("2 records verified.");
  for (const id of ["JAG-0601", "JAG-0603"]) await expect(row(id).getByText("Verified", { exact: true })).toBeVisible();
  await expect(row("JAG-0602").getByText("Disputed", { exact: true })).toBeVisible();
  await expect(row("JAG-0602").getByText("Verified", { exact: true })).toHaveCount(0);
  await expect(summary(page)).toContainText("141 not verified");
});

test("worker search narrows the list and an impossible filter shows the empty state", async ({ page }) => {
  await open(page, `/attendance?date=${DAY}`, "Attendance");
  const worker = page.getByRole("searchbox", { name: "Worker" });

  await worker.fill("JAG-0601");
  await expect(summary(page)).toHaveText(/^1 shift · /);
  await expect(page.getByRole("button", { name: /^[A-Z]{3}-\d{4}/ })).toHaveText(/^JAG-0601/);

  await worker.fill("no such worker");
  await expect(summary(page)).toHaveText(/^0 shifts · /);
  await expect(page.getByText("No shifts match these filters")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("range and status query params preselect the filters", async ({ page }) => {
  await open(page, "/attendance?range=month&status=UNVERIFIED", "Attendance");
  await expect(page.getByLabel("Range")).toHaveValue("month");
  await expect(page.getByLabel("Status", { exact: true }).locator("option:checked")).toHaveText("Not verified");
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("UNVERIFIED");
  await expect(summary(page)).not.toHaveText(/^0 shifts/);
});
