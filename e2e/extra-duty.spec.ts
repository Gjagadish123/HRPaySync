import type { Locator, Page } from "@playwright/test";
import { expect, latestToast, open, test, viewAs } from "./fixtures";

const count = async (page: Page) => Number((await page.getByText(/\d+ requests?, newest first/).textContent())!.match(/\d+/)![0]);
const detail = (page: Page, workerId?: string) => page.getByRole("dialog", { name: workerId ? `Extra duty · ${workerId}` : /^Extra duty · / });
const status = (dialog: Locator) => dialog.locator('[data-slot="badge"]').first();
const check = (dialog: Locator, rule: string) => dialog.getByRole("list", { name: "Compliance checks" }).getByRole("listitem").filter({ hasText: rule });

test("the Open filter hides closed requests that All shows", async ({ page }) => {
  await open(page, "/extra-duty", "Extra duty");
  const filter = page.getByRole("radiogroup", { name: "Show extra duty" });
  await expect(filter.getByRole("radio", { name: "Open" })).toHaveAttribute("aria-checked", "true");
  const openCount = await count(page);
  const closedRows = page.getByRole("button").filter({ has: page.locator('[data-slot="badge"]', { hasText: /^Closed$/ }) });
  await expect(closedRows).toHaveCount(0);

  await filter.getByRole("radio", { name: "All, incl. closed" }).click();
  await expect(filter.getByRole("radio", { name: "All, incl. closed" })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => count(page)).toBeGreaterThan(openCount);
  // The seeded closed request (xd-a) only appears under All.
  await expect(closedRows).not.toHaveCount(0);
});

test("a new extra duty validates, blocks an impossible end time and submits for approval", async ({ page }) => {
  await open(page, "/extra-duty", "Extra duty");
  await page.getByRole("button", { name: "New extra duty" }).click();
  const sheet = page.getByRole("dialog", { name: "New extra duty" });
  for (const label of ["Worker", "Linked regular shift", "Planned to end at", "Reason", "Supervisor", "Remarks"]) {
    await expect(sheet.getByLabel(label, { exact: true })).toBeVisible();
  }
  const consent = sheet.getByRole("checkbox", { name: "Worker has agreed to the extra duty" });
  await expect(consent).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save draft" })).toBeVisible();
  const submit = sheet.getByRole("button", { name: "Submit for approval" });

  await submit.click();
  for (const msg of [
    "Choose the worker.",
    "Choose the regular shift this extra duty is linked to.",
    "Name the supervisor responsible.",
    "Record the worker's agreement before submitting.",
  ]) {
    await expect(sheet.getByText(msg)).toBeVisible();
  }

  await sheet.getByLabel("Worker", { exact: true }).selectOption("MAY-0005");
  await sheet.getByLabel("Linked regular shift").selectOption({ label: "Fri 6 Nov · D 08:00–20:00" });

  // Ends before the shift does: the range itself is invalid, so submitting is blocked.
  await sheet.getByLabel("Planned to end at").fill("2026-11-06T19:00");
  await expect(check(sheet, "Valid time range")).toContainText("Blocked.");
  await expect(submit).toBeDisabled();

  await sheet.getByLabel("Planned to end at").fill("2026-11-06T23:00");
  await expect(check(sheet, "Valid time range")).toHaveCount(0);
  await expect(check(sheet, "Continuous duty")).toBeVisible();
  await expect(check(sheet, "Rest")).toBeVisible();
  await expect(check(sheet, "Weekly hours")).toContainText("Warning.");
  await expect(submit).toBeEnabled();

  await sheet.getByLabel("Supervisor", { exact: true }).fill("Supervisor · Admin block");
  await consent.check();
  await submit.click();

  await expect(latestToast(page)).toContainText("Extra duty submitted.");
  const d = detail(page, "MAY-0005");
  await expect(status(d)).toHaveText("Pending approval");
  await expect(d.getByText("Supervisor · Admin block")).toBeVisible();
});

test("rejecting needs a reason, then marks the request rejected", async ({ page }) => {
  await page.goto("/extra-duty#xd-t"); // a hash-opened sheet is modal, so the h1 is hidden from the a11y tree
  const d = detail(page);
  await expect(status(d)).toHaveText("Pending approval");

  await d.getByRole("button", { name: "Reject" }).click();
  await expect(d.getByText("Give the reason for rejecting (at least 5 characters).")).toBeVisible();
  await expect(status(d)).toHaveText("Pending approval");

  await d.getByLabel("Note").fill("Use the night crew instead.");
  await d.getByRole("button", { name: "Reject" }).click();
  await expect(latestToast(page)).toContainText("Extra duty rejected.");
  await expect(status(d)).toHaveText("Rejected");
});

test("approving a pending request records it in the history and survives reload", async ({ page }) => {
  await page.goto("/extra-duty#xd-t");
  const d = detail(page);
  const history = d.locator("section").filter({ has: page.getByRole("heading", { name: "History" }) }).getByRole("listitem");
  await expect(history).toHaveCount(2);

  await d.getByRole("button", { name: "Approve" }).click();
  await expect(latestToast(page)).toContainText("Extra duty approved.");
  await expect(status(d)).toHaveText("Approved");
  await expect(history).toHaveCount(3);
  await expect(history.last()).toContainText("Approved");
  await expect(history.last()).toContainText("Plant HR");
  await expect(d.getByRole("button", { name: "Approve" })).toHaveCount(0);

  await page.reload();
  await expect(status(detail(page))).toHaveText("Approved");
});

test("closing a completed extension needs a review note", async ({ page }) => {
  await page.goto("/extra-duty#xd-c");
  const d = detail(page);
  await expect(status(d)).toHaveText("Completed");

  const close = d.getByRole("button", { name: "Close after review" });
  await close.click();
  await expect(d.getByText("Add a review note (at least 5 characters).")).toBeVisible();

  await d.getByLabel("Note").fill("Actual 3h 15m verified against punches.");
  await close.click();
  await expect(latestToast(page)).toContainText("Extra duty closed.");
  await expect(status(d)).toHaveText("Closed");
  await expect(close).toHaveCount(0);
});

test("a contractor admin only opens their own workers' requests and cannot approve", async ({ page }) => {
  await viewAs(page, { role: "CONTRACTOR_ADMIN", name: "Pooja Agencies admin", contractorId: "c-pooja" });

  // xd-a belongs to an SVM worker: the hash link must not open it.
  await open(page, "/extra-duty#xd-a", "Extra duty");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/extra-duty#xd-b");
  const d = detail(page);
  await expect(d).toBeVisible();
  await expect(d.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(d.getByRole("button", { name: "Close after review" })).toHaveCount(0);
  await expect(d.getByRole("note")).toContainText("Read-only.");

  // Switching the hash to the other contractor's record closes the sheet instead of showing it.
  await page.goto("/extra-duty#xd-a");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
