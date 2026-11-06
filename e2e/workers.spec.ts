import type { Locator, Page } from "@playwright/test";
import { expect, latestToast, open, test, viewAs } from "./fixtures";

// Seed: 179 active workers. Codes are <contractor code>-<4 digits>; the device ID is 1 followed by those digits
// (MAY-0003 → 10003). The highest codes are MAY-0029, SVM-0406 and POO-0540.
const POOJA = { role: "CONTRACTOR_ADMIN", name: "Pooja Agencies admin", contractorId: "c-pooja" } as const;
const MAYFAIR_HK = "Mayfair Consultancy · Housekeeping";
const POOJA_PACK = "Pooja Agencies · Packing & Dispatch";
const SVM_LU = "SRI VENKATARAMANA MANAGEMENTS (SVM) · Loading & Unloading";

const activeCount = (page: Page) => page.getByText(/^\d+ active workers?\./);
const search = (page: Page) => page.getByRole("searchbox", { name: "Search workers" });
const rows = (page: Page) => page.getByRole("table").getByRole("row").filter({ has: page.getByRole("cell") });
const addSheet = (page: Page) => page.getByRole("dialog", { name: "Add worker" });
/** The value shown next to a label in the worker sheet's fact lists. */
const fact = (sheet: Locator, label: string) => sheet.locator("dt").filter({ hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");

async function openAdd(page: Page) {
  await page.getByRole("button", { name: "Add worker" }).click();
  await expect(addSheet(page)).toBeVisible();
  return addSheet(page);
}

/** Fills every required field with valid values (the deployment and employee code are left as they are). */
async function fillRequired(sheet: Locator, deviceId = "90001") {
  await sheet.getByLabel("Designation").fill("Housekeeper");
  await sheet.getByLabel("Skill category").selectOption({ label: "Unskilled" });
  await sheet.getByLabel("Full name").fill("Kiran Testworker");
  await sheet.getByLabel("Father's or guardian's name").fill("Mohan T");
  await sheet.getByLabel("Gender").selectOption({ label: "Male" });
  await sheet.getByLabel("Date of birth").fill("1990-05-15");
  await sheet.getByLabel("Mobile", { exact: true }).fill("98765 43210");
  await sheet.getByLabel("Device ID").fill(deviceId);
}

test("the proposed employee code follows the deployment until edited; an edited code is checked and kept", async ({ page }) => {
  await open(page, "/workers", "Workers");
  await expect(activeCount(page)).toHaveText(/^179 active workers\./);
  const sheet = await openAdd(page);
  const code = sheet.getByLabel("Employee code");

  // Proposed from the contractor of the chosen deployment, and it follows changes of deployment.
  await expect(sheet.getByLabel("Deployment").locator("option:checked")).toHaveText(MAYFAIR_HK);
  await expect(code).toHaveValue("MAY-0030");
  await expect(sheet.getByText("Suggested from the contractor code. You can change it before saving.")).toBeVisible();
  await sheet.getByLabel("Deployment").selectOption({ label: POOJA_PACK });
  await expect(code).toHaveValue("POO-0541");
  await sheet.getByLabel("Deployment").selectOption({ label: SVM_LU });
  await expect(code).toHaveValue("SVM-0407");

  // Once typed, the code stays put when the deployment changes, and the suggestion is offered instead.
  await code.fill("may-0001");
  await expect(code).toHaveValue("MAY-0001");
  await sheet.getByLabel("Deployment").selectOption({ label: MAYFAIR_HK });
  await expect(code).toHaveValue("MAY-0001");
  await expect(sheet.getByRole("button", { name: "Use suggested code MAY-0030" })).toBeVisible();

  await fillRequired(sheet);
  await sheet.getByRole("button", { name: "Add worker" }).click();
  await expect(sheet.getByText("MAY-0001 is already used by Ramesh A (MAY-0001).")).toBeVisible();
  await expect(code).toHaveAttribute("aria-invalid", "true");

  await code.fill("MAY 01");
  await sheet.getByRole("button", { name: "Add worker" }).click();
  await expect(sheet.getByText("Use 3–20 capital letters, digits or hyphens.")).toBeVisible();

  await sheet.getByRole("button", { name: "Use suggested code MAY-0030" }).click();
  await expect(code).toHaveValue("MAY-0030");
  await code.fill("MAY-0100");
  await sheet.getByRole("button", { name: "Add worker" }).click();

  await expect(latestToast(page)).toContainText("MAY-0100 added. Roster the worker to start attendance.");
  await expect(addSheet(page)).toBeHidden();
  const worker = page.getByRole("dialog", { name: "MAY-0100" });
  await expect(worker).toBeVisible();
  await expect(page).toHaveURL(/\/workers#MAY-0100$/);
  await expect(worker.getByText("Kiran Testworker")).toBeVisible();
  await expect(fact(worker, "Employee code")).toHaveText("MAY-0100");
  await expect(fact(worker, "Device ID")).toHaveText("90001");
  await expect(fact(worker, "Deployment")).toHaveText(MAYFAIR_HK);

  await page.keyboard.press("Escape");
  await expect(worker).toBeHidden();
  await expect(activeCount(page)).toHaveText(/^180 active workers\./);
  await search(page).fill("MAY-0100");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Kiran Testworker");

  // Saved: after a reload the hash reopens the same worker.
  await page.goto("/workers#MAY-0100");
  await expect(page.getByRole("dialog", { name: "MAY-0100" })).toBeVisible();
});

test("a Device ID already in use names its worker; enrolling later stores PENDING-<code>", async ({ page }) => {
  await open(page, "/workers", "Workers");
  const sheet = await openAdd(page);
  await fillRequired(sheet, "10003");
  await sheet.getByRole("button", { name: "Add worker" }).click();
  await expect(sheet.getByText("Device ID 10003 is already used by Lakshmi K (MAY-0003).")).toBeVisible();
  await expect(sheet.getByLabel("Device ID")).toHaveAttribute("aria-invalid", "true");
  await expect(addSheet(page)).toBeVisible();

  await sheet.getByLabel("Enrol on device later").check();
  await expect(sheet.getByLabel("Device ID")).toBeDisabled();
  await expect(sheet.getByLabel("Device ID")).toHaveValue("");
  await expect(sheet.getByText(/^Device ID 10003 is already used/)).toHaveCount(0);
  await sheet.getByRole("button", { name: "Add worker" }).click();

  await expect(latestToast(page)).toContainText("MAY-0030 added. Enrol the face on the device, then roster the worker.");
  const worker = page.getByRole("dialog", { name: "MAY-0030" });
  await expect(fact(worker, "Device ID")).toHaveText("Not enrolled yet");
  await page.keyboard.press("Escape");
  await expect(worker).toBeHidden();

  // The placeholder device ID is what is stored, so it is searchable and survives a reload.
  await search(page).fill("PENDING-MAY-0030");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("MAY-0030");
  await expect(rows(page)).toContainText("Not enrolled");
  await page.reload();
  await search(page).fill("pending-may-0030");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Kiran Testworker");
});

test("add worker checks age, mobile and statutory numbers, and keeps only the last 4 of the ID proof", async ({ page }) => {
  await open(page, "/workers", "Workers");
  const sheet = await openAdd(page);
  await fillRequired(sheet);
  await expect(sheet.getByText("Only the type and last 4 characters of the ID proof are kept. Full ID numbers are never stored.")).toBeVisible();
  await expect(sheet.getByLabel("ID proof, last 4 characters")).toHaveAttribute("maxlength", "4");

  await sheet.getByLabel("Date of birth").fill("2010-01-01");
  await sheet.getByLabel("Mobile", { exact: true }).fill("12345");
  await sheet.getByLabel("UAN").fill("12345");
  await sheet.getByLabel("ESIC number").fill("123456789012");
  await sheet.getByLabel("ID proof type").selectOption({ label: "Aadhaar" });
  await sheet.getByLabel("ID proof, last 4 characters").fill("12AB");
  await sheet.getByRole("button", { name: "Add worker" }).click();

  await expect(sheet.getByText("The worker must be at least 18 on the joining date (5 Nov 2026).")).toBeVisible();
  await expect(sheet.getByText("Enter a 10-digit Indian mobile number, e.g. 98765 43210.")).toBeVisible();
  await expect(sheet.getByText("The UAN is 12 digits.")).toBeVisible();
  await expect(sheet.getByText("The ESIC number is 10 or 17 digits.")).toBeVisible();
  await expect(sheet.getByText("Enter the last 4 digits of the Aadhaar number.")).toBeVisible();
  for (const label of ["Date of birth", "UAN", "ESIC number", "ID proof, last 4 characters"]) {
    await expect(sheet.getByLabel(label)).toHaveAttribute("aria-invalid", "true");
  }
  await expect(sheet.getByLabel("Mobile", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(addSheet(page)).toBeVisible();

  await sheet.getByLabel("Date of birth").fill("1990-05-15");
  await sheet.getByLabel("Mobile", { exact: true }).fill("+91 98765-43210");
  await sheet.getByLabel("UAN").fill("1234 5678 9012");
  await sheet.getByLabel("ESIC number").fill("12345678901234567");
  await sheet.getByLabel("ID proof, last 4 characters").fill("9012");
  await sheet.getByRole("button", { name: "Add worker" }).click();

  await expect(latestToast(page)).toContainText("MAY-0030 added.");
  const worker = page.getByRole("dialog", { name: "MAY-0030" });
  await expect(fact(worker, "Mobile")).toHaveText("+91 9876543210");
  await expect(fact(worker, "Date of birth")).toHaveText("15 May 1990 (age 36)");
  await expect(fact(worker, "UAN")).toHaveText("123456789012");
  await expect(fact(worker, "ESIC number")).toHaveText("12345678901234567");
  await expect(fact(worker, "ID proof")).toHaveText("Aadhaar •••• 9012");

  await page.keyboard.press("Escape");
  await expect(activeCount(page)).toHaveText(/^180 active workers\./);
  // Search by mobile, typed the way people write it.
  await search(page).fill("98765 43210");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("MAY-0030");
  await expect(rows(page)).toContainText("+91 9876543210");
});

test("Edit details keeps the code fixed, checks the Device ID and saves a cleared ID proof", async ({ page }) => {
  await page.goto("/workers#MAY-0002");
  const sheet = page.getByRole("dialog", { name: "MAY-0002" });
  await expect(fact(sheet, "Device ID")).toHaveText("10002");
  await expect(fact(sheet, "ID proof")).toHaveText(/^Aadhaar •••• \d{4}$/);

  await sheet.getByRole("button", { name: "Edit details" }).click();
  await expect(sheet.getByText("Edit details", { exact: true })).toBeVisible();
  await expect(sheet.getByLabel("Employee code")).toBeDisabled();
  await expect(sheet.getByLabel("Employee code")).toHaveValue("MAY-0002");
  await expect(sheet.getByText("Fixed once the worker is created.")).toBeVisible();
  await expect(sheet.getByLabel("Device ID")).toHaveValue("10002");

  await sheet.getByLabel("Device ID").fill("10003");
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet.getByText("Device ID 10003 is already used by Lakshmi K (MAY-0003).")).toBeVisible();

  await sheet.getByLabel("Device ID").fill("20002");
  await sheet.getByLabel("Designation").fill("Senior housekeeper");
  await sheet.getByLabel("ID proof type").selectOption({ label: "None" });
  await sheet.getByLabel("ID proof, last 4 characters").fill("");
  await sheet.getByRole("button", { name: "Save changes" }).click();

  await expect(latestToast(page)).toContainText("MAY-0002 updated.");
  await expect(sheet.getByRole("button", { name: "Edit details" })).toBeVisible();
  await expect(fact(sheet, "Device ID")).toHaveText("20002");
  await expect(fact(sheet, "ID proof")).toHaveText("—");
  await expect(sheet.getByText(/^Senior housekeeper/)).toBeVisible();

  await page.reload();
  const again = page.getByRole("dialog", { name: "MAY-0002" });
  await expect(fact(again, "Device ID")).toHaveText("20002");
  await expect(fact(again, "ID proof")).toHaveText("—");
  await expect(again.getByText(/^Senior housekeeper/)).toBeVisible();
  await page.keyboard.press("Escape");
  await search(page).fill("20002");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("MAY-0002");
});

test("transfer refuses a past date and schedules a future one without rewriting history", async ({ page }) => {
  await page.goto("/workers#MAY-0002");
  const sheet = page.getByRole("dialog", { name: "MAY-0002" });
  await expect(sheet).toBeVisible();
  const history = sheet.getByRole("heading", { name: "Assignment history" }).locator("xpath=following-sibling::ol");
  await expect(history.getByRole("listitem")).toHaveCount(1);

  await sheet.getByLabel("New deployment").selectOption({ label: POOJA_PACK });
  await sheet.getByLabel("Effective from").fill("2026-11-01");
  await sheet.getByRole("button", { name: "Record transfer" }).click();
  await expect(sheet.getByText("A transfer takes effect today or later; history is never rewritten.")).toBeVisible();
  await expect(history.getByRole("listitem")).toHaveCount(1);

  await sheet.getByLabel("Effective from").fill("2026-11-10");
  await sheet.getByRole("button", { name: "Record transfer" }).click();
  await expect(latestToast(page)).toContainText("Transfer recorded. Earlier assignments are kept.");
  await expect(sheet.getByText("A transfer takes effect today or later; history is never rewritten.")).toHaveCount(0);

  await expect(history.getByRole("listitem")).toHaveCount(2);
  const scheduled = history.getByRole("listitem").filter({ hasText: "Pooja Agencies" });
  await expect(scheduled).toContainText("Scheduled");
  await expect(scheduled).toContainText("From Tue 10 Nov 2026");
  const current = history.getByRole("listitem").filter({ hasText: "Mayfair Consultancy" });
  await expect(current).toContainText("Current");
  await expect(current).not.toContainText("Scheduled");
  // Until the 10th the worker is still Mayfair's.
  await expect(fact(sheet, "Deployment")).toHaveText(MAYFAIR_HK);

  await page.reload();
  await expect(page.getByRole("dialog", { name: "MAY-0002" }).getByText("Scheduled")).toBeVisible();
});

test("deactivating a worker keeps the record and offers reactivation", async ({ page }) => {
  await page.goto("/workers#MAY-0003");
  const sheet = page.getByRole("dialog", { name: "MAY-0003" });
  await expect(sheet.getByText("Active", { exact: true })).toBeVisible();

  await sheet.getByRole("button", { name: "Deactivate" }).click();
  await expect(latestToast(page)).toContainText("Worker deactivated. Their records stay.");
  await expect(sheet.getByRole("button", { name: "Reactivate" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
  await expect(sheet.getByText("Inactive", { exact: true })).toBeVisible();

  // Closed: the active count drops and the worker is listed under Inactive only.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(activeCount(page)).toHaveText(/^178 active workers\./);
  await search(page).fill("MAY-0003");
  await expect(page.getByText("No workers match")).toBeVisible();
  await page.getByRole("radio", { name: "Inactive" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("MAY-0003");

  await page.reload();
  await page.getByRole("radio", { name: "Inactive" }).click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Lakshmi K (MAY-0003)" }).click();
  await sheet.getByRole("button", { name: "Reactivate" }).click();
  await expect(latestToast(page)).toContainText("Worker reactivated.");
  await expect(sheet.getByRole("button", { name: "Deactivate" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(activeCount(page)).toHaveText(/^179 active workers\./);
});

test("?contractor= preselects the contractor filter, and search finds workers by device ID and mobile", async ({ page }) => {
  await open(page, "/workers?contractor=c-pooja", "Workers");
  const contractor = page.getByRole("combobox", { name: "Contractor" });
  await expect(contractor).toHaveValue("c-pooja");
  await expect(page.getByText("Showing 40 of 40")).toBeVisible();
  for (const id of await rows(page).locator("td:first-child").allTextContents()) expect(id).toMatch(/^POO-\d{4}$/);
  await expect(page.getByRole("combobox", { name: "Deployment" }).locator("option")).toHaveText(["All deployments", POOJA_PACK]);

  await contractor.selectOption({ label: "All contractors" });
  await expect(page.getByText("Showing 179 of 179")).toBeVisible();

  await search(page).fill("10503");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("POO-0503");
  await expect(rows(page)).toContainText("Parvathi M");

  const mobile = (await rows(page).getByRole("cell").nth(5).innerText()).trim();
  expect(mobile).toMatch(/^\+91 [6-9]\d{9}$/);
  const digits = mobile.slice(4);
  await search(page).fill(`${digits.slice(0, 5)} ${digits.slice(5)}`);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("POO-0503");
});

test.describe("contractor admin (Pooja Agencies)", () => {
  test.beforeEach(async ({ page }) => {
    await viewAs(page, POOJA);
  });

  test("sees only Pooja workers and cannot open another contractor's worker by link", async ({ page }) => {
    await open(page, "/workers#SVM-0101", "Workers");
    await expect(activeCount(page)).toHaveText(/^40 active workers\./);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Contractor" })).toHaveCount(0);
    const ids = rows(page).locator("td:first-child");
    await expect(ids).toHaveCount(40);
    for (const id of await ids.allTextContents()) expect(id).toMatch(/^POO-\d{4}$/);

    await page.goto("/workers#POO-0503");
    const sheet = page.getByRole("dialog", { name: "POO-0503" });
    await expect(fact(sheet, "Deployment")).toHaveText(POOJA_PACK);
    await expect(sheet.getByRole("button", { name: "Edit details" })).toBeVisible();
  });

  test("adds a worker who joins later, then edits them before the joining date", async ({ page }) => {
    await open(page, "/workers", "Workers");
    const sheet = await openAdd(page);
    await expect(sheet.getByLabel("Deployment").locator("option")).toHaveText([POOJA_PACK]);
    await expect(sheet.getByLabel("Employee code")).toHaveValue("POO-0541");

    // Another contractor's worker holds 10001: the message does not name them.
    await fillRequired(sheet, "10001");
    await sheet.getByLabel("Designation").fill("Packer");
    await sheet.getByLabel("Joining date").fill("2026-11-15");
    await sheet.getByRole("button", { name: "Add worker" }).click();
    await expect(sheet.getByText("Device ID 10001 is already used by a worker of another contractor.")).toBeVisible();

    await sheet.getByLabel("Device ID").fill("90541");
    await sheet.getByRole("button", { name: "Add worker" }).click();
    await expect(latestToast(page)).toContainText("POO-0541 added.");
    const worker = page.getByRole("dialog", { name: "POO-0541" });
    await expect(worker.getByText("Joins 15 Nov 2026")).toBeVisible();
    await expect(fact(worker, "Deployment")).toHaveText(POOJA_PACK);

    await worker.getByRole("button", { name: "Edit details" }).click();
    await worker.getByLabel("Designation").fill("Senior packer");
    await worker.getByRole("button", { name: "Save changes" }).click();
    await expect(latestToast(page)).toContainText("POO-0541 updated.");
    await expect(worker.getByText(/^Senior packer/)).toBeVisible();

    await page.reload();
    const again = page.getByRole("dialog", { name: "POO-0541" });
    await expect(again.getByText(/^Senior packer/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(activeCount(page)).toHaveText(/^41 active workers\./);
    await search(page).fill("POO-0541");
    await expect(rows(page)).toContainText("Joins 15 Nov");
  });
});
