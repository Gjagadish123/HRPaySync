import type { Page } from "@playwright/test";
import { expect, latestToast, open, test, TODAY } from "./fixtures";

// Client-side navigations fetch the route's RSC payload, which can be slow while the shared server is busy.
const navExpect = expect.configure({ timeout: 30_000 });

/** A contractor's card, found by the name in its heading. */
const card = (page: Page, name: string) =>
  page.getByRole("heading", { level: 2, name: new RegExp(`^[A-Z]{2,4}\\s*${name.replace(/[()]/g, "\\$&")}$`) }).locator("xpath=ancestor::section[1]");
const editSheet = (page: Page, name: string) => page.getByRole("dialog", { name: `Edit ${name}` });
const approvedTotal = (page: Page) =>
  page.getByRole("heading", { level: 2, name: "Department strength" }).locator("xpath=ancestor::*[@data-slot='card'][1]").locator("tfoot td").nth(1);

// Active workers per contractor in the seed (179 in all).
const SEEDED: [code: string, name: string, id: string, workers: number][] = [
  ["MAY", "Mayfair Consultancy", "c-mayfair", 29],
  ["SVM", "SRI VENKATARAMANA MANAGEMENTS (SVM)", "c-svm", 55],
  ["POO", "Pooja Agencies", "c-pooja", 40],
  ["JAG", "Jagruti Enterprises", "c-jagruti", 21],
  ["JKE", "JK Enterprize", "c-jk", 20],
  ["SGN", "Sree Ganesh", "c-ganesh", 14],
];

test("each contractor has a card whose worker count links to its workers", async ({ page }) => {
  await open(page, "/contractors", "Contractors");
  await expect(page.getByText(/^6 contractors\./)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(SEEDED.map(([code, name]) => `${code}${name}`));

  for (const [, name, id, workers] of SEEDED) {
    const c = card(page, name);
    await expect(c.getByText("Active", { exact: true })).toBeVisible();
    await expect(c.getByRole("link", { name: `${workers} workers` })).toHaveAttribute("href", `/workers?contractor=${id}`);
  }
  await expect(card(page, "Mayfair Consultancy")).toContainText("R. Menon · +91 90000 00101");
  await expect(card(page, "Mayfair Consultancy")).toContainText("Contract 1 Apr 2026 – 31 Mar 2027");
  // Mayfair has one deployment with its licensed, approved and current headcount.
  const row = card(page, "Mayfair Consultancy").getByRole("row").filter({ has: page.getByRole("cell", { name: "Housekeeping" }) });
  await expect(row.getByRole("cell")).toHaveText(["Housekeeping", "30", "25", "29", "1 Apr: 30/25", "Change"]);

  await card(page, "Pooja Agencies").getByRole("link", { name: "40 workers" }).click();
  await navExpect(page).toHaveURL("/workers?contractor=c-pooja");
  await navExpect(page.getByRole("heading", { level: 1, name: "Workers" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Contractor" })).toHaveValue("c-pooja");
  await expect(page.getByText("Showing 40 of 40")).toBeVisible();

  // The Workers page stays mounted between visits, so a second link must still switch its filter.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Contractors", exact: true }).click();
  await navExpect(page.getByRole("heading", { level: 1, name: "Contractors" })).toBeVisible();
  await card(page, "SRI VENKATARAMANA MANAGEMENTS (SVM)").getByRole("link", { name: "55 workers" }).click();
  await navExpect(page).toHaveURL("/workers?contractor=c-svm");
  await expect(page.getByRole("combobox", { name: "Contractor" })).toHaveValue("c-svm");
  await expect(page.getByText("Showing 55 of 55")).toBeVisible();
});

test("Edit details validates contact, phone and dates, and saves status changes that persist", async ({ page }) => {
  await open(page, "/contractors", "Contractors");
  await page.getByRole("button", { name: "Edit details of Mayfair Consultancy" }).click();
  const sheet = editSheet(page, "Mayfair Consultancy");
  await expect(sheet.getByLabel("Contact person")).toHaveValue("R. Menon");
  await expect(sheet.getByLabel("Active contractor")).toBeChecked();

  await sheet.getByLabel("Contact person").fill(" ");
  await sheet.getByLabel("Phone").fill("12");
  await sheet.getByLabel("Contract to").fill("2026-03-01");
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet.getByText("Enter a contact person.")).toBeVisible();
  await expect(sheet.getByText("Enter a valid phone number.")).toBeVisible();
  await expect(sheet.getByText("Contract end must be after the start.")).toBeVisible();
  await expect(sheet.getByLabel("Contract to")).toHaveAttribute("aria-invalid", "true");
  await expect(sheet).toBeVisible();

  await sheet.getByLabel("Contact person").fill("Rekha Menon");
  await sheet.getByLabel("Phone").fill("+91 90000 00999");
  await sheet.getByLabel("Contract to").fill("2027-06-30");
  await sheet.getByLabel("Active contractor").uncheck();
  await expect(sheet.getByText("29 active workers stay deployed. Transfer or deactivate them separately.")).toBeVisible();
  await sheet.getByRole("button", { name: "Save changes" }).click();

  await expect(latestToast(page)).toContainText("Mayfair Consultancy updated.");
  await expect(sheet).toBeHidden();
  const c = card(page, "Mayfair Consultancy");
  await expect(c).toContainText("Rekha Menon · +91 90000 00999");
  await expect(c).toContainText("Contract 1 Apr 2026 – 30 Jun 2027");
  await expect(c.getByText("Inactive", { exact: true })).toBeVisible();

  await page.reload();
  await expect(card(page, "Mayfair Consultancy")).toContainText("Rekha Menon · +91 90000 00999");
  await expect(card(page, "Mayfair Consultancy").getByText("Inactive", { exact: true })).toBeVisible();

  // An inactive contractor can't take new workers.
  await open(page, "/workers", "Workers");
  await page.getByRole("button", { name: "Add worker" }).click();
  const deployments = page.getByRole("dialog", { name: "Add worker" }).getByLabel("Deployment").locator("option");
  await expect(deployments).toHaveCount(8);
  await expect(deployments.filter({ hasText: "Mayfair Consultancy" })).toHaveCount(0);
});

test("a contract ending within 30 days is flagged on its card", async ({ page }) => {
  await open(page, "/contractors", "Contractors");
  await expect(page.getByText(/^Ends (in|today)/)).toHaveCount(0);

  await page.getByRole("button", { name: "Edit details of JK Enterprize" }).click();
  const sheet = editSheet(page, "JK Enterprize");
  await sheet.getByLabel("Contract to").fill("2026-11-15"); // TODAY + 10 days
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(latestToast(page)).toContainText("JK Enterprize updated.");

  await expect(card(page, "JK Enterprize").getByText("Ends in 10 days")).toBeVisible();
  await expect(page.getByText(/^Ends in/)).toHaveCount(1);
  await page.reload();
  await expect(card(page, "JK Enterprize").getByText("Ends in 10 days")).toBeVisible();
});

test("strength change is validated and feeds the dashboard's approved total", async ({ page }) => {
  await open(page, "/", "Dashboard");
  await expect(approvedTotal(page)).toHaveText("155");

  await open(page, "/contractors", "Contractors");
  await page.getByRole("button", { name: "Change strength for Mayfair Consultancy · Housekeeping" }).click();
  await expect(page.getByText("New strength for Mayfair Consultancy · Housekeeping")).toBeVisible();
  await expect(page.getByLabel("Licensed", { exact: true })).toHaveValue("30");
  await expect(page.getByLabel("Approved", { exact: true })).toHaveValue("25");

  await page.getByLabel("Licensed", { exact: true }).fill("10");
  await page.getByLabel("Approved", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Approved strength can't exceed the licensed strength." })).toBeVisible();

  await page.getByLabel("Licensed", { exact: true }).fill("32");
  await page.getByLabel("Approved", { exact: true }).fill("28");
  await page.getByRole("button", { name: "Save change" }).click();
  await expect(latestToast(page)).toContainText("Strength updated. Reports use it from the effective date.");
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: /strength editor for Mayfair Consultancy · Housekeeping/ }) });
  await expect(row.getByRole("cell").nth(1)).toHaveText("32");
  await expect(row.getByRole("cell").nth(2)).toHaveText("28");
  await expect(row).toContainText("5 Nov: 32/28");

  await open(page, "/", "Dashboard");
  await expect(approvedTotal(page)).toHaveText("158");
});

test("add contractor validates, then the contractor shows up in cards, Workers and the role menu", async ({ page }) => {
  await open(page, "/contractors", "Contractors");
  await page.getByRole("button", { name: "Add contractor" }).click();
  const sheet = page.getByRole("dialog", { name: "Add contractor" });
  await expect(sheet).toBeVisible();

  await sheet.getByRole("button", { name: "Add contractor" }).click();
  await expect(sheet.getByText("2–4 letters.")).toBeVisible();
  await expect(sheet.getByText("Enter the legal or trade name.")).toBeVisible();
  await expect(sheet.getByText("Enter a contact person.")).toBeVisible();
  await expect(sheet.getByText("Enter a valid phone number.")).toBeVisible();
  await expect(sheet.getByText("Contract end must be after the start.")).toBeVisible();

  // An existing code or name is refused, and approved can't exceed licensed.
  await sheet.getByLabel("Code").fill("MAY");
  await sheet.getByLabel("Name", { exact: true }).fill("pooja agencies");
  await sheet.getByLabel("Licensed strength").fill("12");
  await sheet.getByLabel("Approved strength").fill("14");
  await sheet.getByRole("button", { name: "Add contractor" }).click();
  await expect(sheet.getByText("Code already in use.")).toBeVisible();
  await expect(sheet.getByText("A contractor with this name already exists.")).toBeVisible();
  await expect(sheet.getByText("0 to licensed strength.")).toBeVisible();

  await sheet.getByLabel("Code").fill("SKY");
  await sheet.getByLabel("Name", { exact: true }).fill("Skyline Facility Services");
  await sheet.getByLabel("Contact person").fill("A. Kulkarni");
  await sheet.getByLabel("Phone").fill("+91 90000 00199");
  await expect(sheet.getByLabel("Contract from")).toHaveValue(TODAY);
  await sheet.getByLabel("Contract to").fill("2027-10-31");
  await sheet.getByLabel("First department").selectOption({ label: "Gardening" });
  await sheet.getByLabel("Approved strength").fill("10");
  await sheet.getByRole("button", { name: "Add contractor" }).click();

  await expect(latestToast(page)).toContainText("Skyline Facility Services added with its first deployment.");
  await expect(sheet).toBeHidden();
  await expect(page.getByText(/^7 contractors\./)).toBeVisible();
  const c = card(page, "Skyline Facility Services");
  await expect(c).toContainText("A. Kulkarni · +91 90000 00199");
  await expect(c.getByRole("link", { name: "0 workers" })).toHaveAttribute("href", "/workers?contractor=c-sky");
  const row = c.getByRole("row").filter({ has: page.getByRole("cell", { name: "Gardening" }) });
  await expect(row.getByRole("cell").nth(1)).toHaveText("12");
  await expect(row.getByRole("cell").nth(2)).toHaveText("10");

  // Workers can be added to its deployment straight away, with codes from its contractor code.
  await open(page, "/workers", "Workers");
  await expect(page.getByRole("combobox", { name: "Contractor" }).locator("option", { hasText: "Skyline Facility Services" })).toHaveCount(1);
  await page.getByRole("button", { name: "Add worker" }).click();
  const add = page.getByRole("dialog", { name: "Add worker" });
  await add.getByLabel("Deployment").selectOption({ label: "Skyline Facility Services · Gardening" });
  await expect(add.getByLabel("Employee code")).toHaveValue("SKY-0001");
  await page.keyboard.press("Escape");
  await expect(add).toBeHidden();

  await page.getByRole("button", { name: /^Viewing as Plant HR/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Skyline Facility Services" })).toBeVisible();
});

test("a strength change can't be backdated; a future one is scheduled without changing today's figures", async ({ page }) => {
  await open(page, "/contractors", "Contractors");
  await page.getByRole("button", { name: "Change strength for Mayfair Consultancy · Housekeeping" }).click();
  const from = page.getByLabel("Effective from");
  await expect(from).toHaveValue(TODAY);
  await expect(from).toHaveAttribute("min", TODAY);
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: /strength editor for Mayfair Consultancy · Housekeeping/ }) });

  await from.fill("2026-11-01");
  await page.getByLabel("Licensed", { exact: true }).fill("32");
  await page.getByLabel("Approved", { exact: true }).fill("28");
  await page.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByText("A strength change takes effect today or later; past reports are never rewritten.")).toBeVisible();
  await expect(from).toHaveAttribute("aria-invalid", "true");
  await expect(row.getByRole("cell")).toHaveText(["Housekeeping", "30", "25", "29", "1 Apr: 30/25", "Close"]);

  await from.fill("2026-11-10");
  await page.getByRole("button", { name: "Save change" }).click();
  await expect(latestToast(page)).toContainText("Strength updated. Reports use it from the effective date.");
  await expect(page.getByText("A strength change takes effect today or later; past reports are never rewritten.")).toHaveCount(0);
  // Today's strength is unchanged until the 10th.
  await expect(row.getByRole("cell")).toHaveText(["Housekeeping", "30", "25", "29", "10 Nov: 32/28 · 1 Apr: 30/25", "Close"]);

  await page.reload();
  const again = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Change strength for Mayfair Consultancy · Housekeeping" }) });
  await expect(again).toContainText("10 Nov: 32/28 · 1 Apr: 30/25");
});
