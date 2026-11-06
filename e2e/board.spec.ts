import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

// At 12:00 on Thu 5 Nov the board has 154 shifts: 8 late, 2 absent, 71 on duty now and 73 night shifts not started.
const queueItems = (page: Page) => page.locator("[data-queue] ol > li");
const selected = (page: Page) => page.locator("[data-queue] li[class*='bg-accent']");
const navExpect = expect.configure({ timeout: 30_000 });

const board = (page: Page) => page.getByRole("region", { name: "Shift board" });
const chips = (page: Page) => board(page).locator("[data-assignment]");
const dimmed = (page: Page) => board(page).locator("[data-assignment].opacity-25");
const chip = (page: Page, workerId: string) => board(page).getByRole("button", { name: new RegExp(`^${workerId} `) });
const pill = (page: Page, name: string) => page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name, exact: true });
const matchLine = (page: Page) => page.getByText(/(shifts? on the board|shifts? match|No shift matches)/);

test("the board groups deployments by contractor and counts what needs action", async ({ page }) => {
  await open(page, "/board", "Shift board");

  const groups = board(page).getByRole("heading", { level: 2 });
  expect(await groups.count()).toBeGreaterThan(1);
  for (const h of await groups.all()) await expect(h).toHaveText(/\d+ \/ \d+ present$/);
  await expect(groups.filter({ hasText: "Pooja Agencies" })).toHaveCount(1);

  const queue = page.getByRole("complementary", { name: "Needs action" });
  const badge = queue.getByRole("heading", { name: /^Needs action/ }).locator('[data-slot="badge"]');
  const n = await queueItems(page).count();
  expect(n).toBeGreaterThan(1);
  await expect(badge).toHaveText(String(n));
  await expect(selected(page)).toHaveCount(1);
});

test("the legend shows only the statuses on the board, then the chip markers", async ({ page }) => {
  await open(page, "/board", "Shift board");
  const legend = page.getByRole("list", { name: "Legend" });
  await expect(legend.getByRole("listitem")).toHaveText([
    "Late",
    "Absent",
    "On duty now",
    "Not started",
    "Extra duty",
    "Disputed",
    "Needs action",
    "Selected item or search match",
  ]);
  // Nobody has finished a shift or missed an OUT yet today, so those statuses are left out.
  for (const absent of ["Present", "Missing OUT"]) await expect(legend.getByRole("listitem").filter({ hasText: absent })).toHaveCount(0);
});

test("status pills count today's shifts and dim everything that does not match", async ({ page }) => {
  await open(page, "/board", "Shift board");
  const all = pill(page, "All 154");
  const late = pill(page, "Late 8");
  const absent = pill(page, "Absent 2");
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(pill(page, "On duty now 71")).toBeEnabled();
  await expect(pill(page, "Not started 73")).toBeEnabled();
  // Statuses with no shifts cannot be picked.
  await expect(pill(page, "Present 0")).toBeDisabled();
  await expect(pill(page, "Missing OUT 0")).toBeDisabled();
  await expect(chips(page)).toHaveCount(154);
  await expect(dimmed(page)).toHaveCount(0);
  await expect(matchLine(page)).toHaveText("154 shifts on the board");

  await late.click();
  await expect(late).toHaveAttribute("aria-pressed", "true");
  await expect(all).toHaveAttribute("aria-pressed", "false");
  await expect(matchLine(page)).toHaveText("8 of 154 shifts match");
  await expect(dimmed(page)).toHaveCount(146);
  await expect(chip(page, "SVM-0103")).not.toHaveClass(/opacity-25/); // late
  await expect(chip(page, "SVM-0101")).toHaveClass(/opacity-25/); // on duty, on time

  // Pills combine.
  await absent.click();
  await expect(matchLine(page)).toHaveText("10 of 154 shifts match");
  await expect(dimmed(page)).toHaveCount(144);
  await expect(chip(page, "POO-0531")).not.toHaveClass(/opacity-25/); // absent

  // A second click turns a pill off again.
  await late.click();
  await expect(late).toHaveAttribute("aria-pressed", "false");
  await expect(matchLine(page)).toHaveText("2 of 154 shifts match");
  await expect(chip(page, "SVM-0103")).toHaveClass(/opacity-25/);

  await all.click();
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(absent).toHaveAttribute("aria-pressed", "false");
  await expect(matchLine(page)).toHaveText("154 shifts on the board");
  await expect(dimmed(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);
});

test("the contractor filter narrows the board and its counts", async ({ page }) => {
  await open(page, "/board", "Shift board");
  const contractor = page.getByLabel("Contractor", { exact: true });
  await expect(contractor).toHaveValue("");

  await contractor.selectOption("Pooja Agencies");
  await expect(board(page).getByRole("heading", { level: 2 })).toHaveText([/^Pooja Agencies/]);
  await expect(board(page).getByRole("article")).toHaveCount(1);
  await expect(chips(page)).toHaveCount(34);
  for (const name of ["All 34", "Late 1", "Absent 1", "On duty now 15", "Not started 17"]) await expect(pill(page, name)).toBeVisible();
  await expect(matchLine(page)).toHaveText("34 shifts on the board");

  // The status pills now work within that contractor.
  await pill(page, "Absent 1").click();
  await expect(matchLine(page)).toHaveText("1 of 34 shifts match");
  await expect(dimmed(page)).toHaveCount(33);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(contractor).toHaveValue("");
  await expect(pill(page, "All 154")).toHaveAttribute("aria-pressed", "true");
  await expect(chips(page)).toHaveCount(154);
  expect(await board(page).getByRole("heading", { level: 2 }).count()).toBeGreaterThan(1);
});

test("searching outlines the matching worker and dims the rest", async ({ page }) => {
  await open(page, "/board", "Shift board");
  const find = page.getByRole("searchbox", { name: "Find a worker" });
  const vinod = chip(page, "SVM-0107");
  await expect(vinod).not.toHaveClass(/outline-primary/);

  await find.fill("svm-0107");
  await expect(matchLine(page)).toHaveText("1 of 154 shifts match");
  await expect(vinod).toHaveClass(/outline-primary/);
  await expect(vinod).not.toHaveClass(/opacity-25/);
  await expect(dimmed(page)).toHaveCount(153);
  await expect(chip(page, "SVM-0109")).toHaveClass(/opacity-25/);

  // By name, across contractors.
  await find.fill("Basavaraj");
  await expect(matchLine(page)).toHaveText(/^\d+ of 154 shifts match$/);
  for (const id of ["SVM-0102", "JAG-0607"]) await expect(chip(page, id)).not.toHaveClass(/opacity-25/);
  await expect(vinod).toHaveClass(/opacity-25/);

  // Search and a status pill narrow together.
  await find.fill("POO-");
  await pill(page, "Late 8").click();
  await expect(matchLine(page)).toHaveText("1 of 154 shifts match");
  await expect(chip(page, "POO-0513")).toHaveClass(/outline-primary/);

  await find.fill("nobody here");
  await expect(matchLine(page)).toHaveText("No shift matches “nobody here” with the chosen statuses");
  await expect(dimmed(page)).toHaveCount(154);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(find).toHaveValue("");
  await expect(dimmed(page)).toHaveCount(0);
  await expect(vinod).not.toHaveClass(/outline-primary/);
});

test("each department card's status bar spells out its counts", async ({ page }) => {
  await open(page, "/board", "Shift board");
  for (const [label, summary, rostered] of [
    ["SRI VENKATARAMANA MANAGEMENTS (SVM) · Housekeeping", "7 shifts today: 1 late, 3 on duty now, 3 not started", "7 shifts rostered · licence 10"],
    ["Pooja Agencies · Packing & Dispatch", "34 shifts today: 1 late, 1 absent, 15 on duty now, 17 not started", /^34 shifts rostered · licence \d+$/],
    ["SRI VENKATARAMANA MANAGEMENTS (SVM) · Gardening", "6 shifts today: 2 late, 4 on duty now", /^6 shifts rostered · licence \d+$/],
  ] as const) {
    const card = board(page).getByRole("article", { name: label });
    const bar = card.getByRole("img", { name: summary, exact: true });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("title", summary);
    await expect(card.getByText(/shifts? rostered · licence/)).toHaveText(rostered);
    await expect(card.locator("[data-assignment]")).toHaveCount(Number(summary.split(" ")[0]));
  }
});

test("J and K step through the queue, but not while the role menu is open", async ({ page }) => {
  await open(page, "/board", "Shift board");
  const items = queueItems(page);
  await expect(items.first()).toHaveClass(/bg-accent/);

  await page.keyboard.press("j");
  await expect(items.nth(1)).toHaveClass(/bg-accent/);
  await expect(selected(page)).toHaveCount(1);
  await page.keyboard.press("k");
  await expect(items.first()).toHaveClass(/bg-accent/);
  // K at the top stays on the first item.
  await page.keyboard.press("k");
  await expect(items.first()).toHaveClass(/bg-accent/);

  await page.getByRole("button", { name: /Change role/ }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("j");
  await expect(items.first()).toHaveClass(/bg-accent/);
  await expect(items.nth(1)).not.toHaveClass(/bg-accent/);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("j");
  await expect(items.nth(1)).toHaveClass(/bg-accent/);
});

test("J does not move the queue while typing in the search box", async ({ page }) => {
  await open(page, "/board", "Shift board");
  const items = queueItems(page);
  await page.getByRole("searchbox", { name: "Find a worker" }).fill("raj");
  await page.keyboard.press("j");
  await expect(page.getByRole("searchbox", { name: "Find a worker" })).toHaveValue("rajj");
  await expect(items.first()).toHaveClass(/bg-accent/);
});

test("Enter on a focused queue item opens its linked page", async ({ page }) => {
  await open(page, "/board", "Shift board");
  await page.keyboard.press("j"); // selects and focuses the second item
  const item = queueItems(page).nth(1);
  await expect(item).toHaveClass(/bg-accent/);
  await expect(item.getByRole("button")).toBeFocused();
  const href = await item.getByRole("link").getAttribute("href");
  expect(href).toBeTruthy();

  await page.keyboard.press("Enter");
  await navExpect(page).toHaveURL(new URL(href!, page.url()).href);
});

test("Enter on a focused queue item that is not selected selects that item; Enter again opens it", async ({ page }) => {
  await open(page, "/board", "Shift board");
  const items = queueItems(page);
  await expect(items.first()).toHaveClass(/bg-accent/);
  const firstHref = await items.first().getByRole("link").getAttribute("href");

  const third = items.nth(2);
  await third.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(third).toHaveClass(/bg-accent/);
  await expect(selected(page)).toHaveCount(1);
  await expect(third.getByRole("button")).toBeFocused();
  await expect(page).toHaveURL(/\/board$/);
  const href = await third.getByRole("link").getAttribute("href");
  expect(href).toBeTruthy();
  expect(href, "the third item links somewhere other than the first").not.toBe(firstHref);

  await page.keyboard.press("Enter");
  await navExpect(page).toHaveURL(new URL(href!, page.url()).href);
});
