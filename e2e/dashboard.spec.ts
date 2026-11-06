import type { Locator, Page } from "@playwright/test";
import { expect, open, test, TODAY, viewAs } from "./fixtures";

// Client-side navigations fetch the route's RSC payload, which can be slow while the shared server is busy.
const navExpect = expect.configure({ timeout: 30_000 });

const keyFigures = (page: Page) => page.locator('section[aria-label="Key figures"]');
const card = (page: Page, title: string | RegExp) => keyFigures(page).getByRole("link", { name: title });
/** A dashboard card (shadcn Card) found by its h2 heading. */
const panel = (page: Page, heading: string) =>
  page.getByRole("heading", { level: 2, name: heading }).locator("xpath=ancestor::*[@data-slot='card'][1]");

/** The big number on a key-figure card: the first number after its title. */
async function figure(link: Locator, title: string) {
  const m = (await link.innerText()).match(new RegExp(`${title}\\s+(\\d+)`));
  expect(m, `a number on the "${title}" card`).not.toBeNull();
  return Number(m![1]);
}

test("key figures: six cards, each a link, with today's numbers", async ({ page }) => {
  await open(page, "/", "Dashboard");
  await expect(keyFigures(page).getByRole("link")).toHaveCount(6);

  const hrefs: [string | RegExp, string][] = [
    ["Present today", "/board"],
    ["Absent today", `/attendance?date=${TODAY}&status=ABSENT`],
    [/^Extra duty · Nov 2026/, "/extra-duty"],
    ["Open replacements", "/replacements"],
    ["Awaiting verification", "/attendance?range=month&status=UNVERIFIED"],
    ["Active workforce", "/workers"],
  ];
  for (const [title, href] of hrefs) await expect(card(page, title)).toHaveAttribute("href", href);

  // 12:00 on a Thursday: day shift under way, night shift not started.
  const present = card(page, "Present today");
  await expect(present).toContainText(/Present today\s*79\s*\/ 155/);
  await expect(present).toContainText("51% of approved");
  await expect(present.getByRole("progressbar")).toHaveAccessibleName("51% of approved strength present");
  await expect(card(page, "Awaiting verification")).toContainText(/439\s*shifts/);
  await expect(card(page, "Active workforce")).toContainText(/179\s*workers/);
  await expect(card(page, "Active workforce")).toContainText("6 contractors · 7 departments");

  // The department table adds up to the headline figure.
  const total = panel(page, "Department strength").locator("tfoot td");
  await expect(total.nth(0)).toHaveText("Total");
  await expect(total.nth(1)).toHaveText("155");
  await expect(total.nth(2)).toHaveText("79");
});

test("dashboard shows its six sections", async ({ page }) => {
  await open(page, "/", "Dashboard");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Daily manpower · last 30 days",
    "Needs attention",
    "Present vs approved by contractor",
    "Today's shifts",
    "Department strength",
    "Recent activity",
  ]);
});

test("Absent today opens the absent list, and the list count equals the card", async ({ page }) => {
  await open(page, "/", "Dashboard");
  const absent = await figure(card(page, "Absent today"), "Absent today");
  expect(absent).toBeGreaterThan(0);

  await card(page, "Absent today").click();
  await navExpect(page).toHaveURL(`/attendance?date=${TODAY}&status=ABSENT`);
  await expect(page.getByRole("heading", { level: 1, name: "Attendance" })).toBeVisible();
  await expect(page.getByLabel("Status")).toHaveValue("ABSENT");
  await expect(page.locator('p[aria-live="polite"]')).toHaveText(new RegExp(`^${absent} shifts? · 0 present · ${absent} absent`));
  // By role, so the dashboard that Next keeps mounted (hidden) behind this route is not counted.
  const rows = page.getByRole("table").getByRole("row").filter({ has: page.getByRole("cell") });
  await expect(rows).toHaveCount(absent);
  for (const row of await rows.all()) await expect(row).toContainText("Absent");
});

test("Awaiting verification opens this month's not-verified shifts with the same count", async ({ page }) => {
  await open(page, "/", "Dashboard");
  const pending = await figure(card(page, "Awaiting verification"), "Awaiting verification");
  expect(pending).toBe(439);

  await card(page, "Awaiting verification").click();
  await navExpect(page).toHaveURL("/attendance?range=month&status=UNVERIFIED");
  await expect(page.getByLabel("Range")).toHaveValue("month");
  await expect(page.getByLabel("Status")).toHaveValue("UNVERIFIED");
  await expect(page.locator('p[aria-live="polite"]')).toHaveText(new RegExp(`^${pending} shifts ·`));
});

test("Open replacements, Extra duty and Active workforce cards open their screens", async ({ page }) => {
  const targets: [string | RegExp, string, string][] = [
    ["Open replacements", "/replacements", "Replacements"],
    [/^Extra duty · Nov 2026/, "/extra-duty", "Extra duty"],
    ["Active workforce", "/workers", "Workers"],
  ];
  for (const [title, url, h1] of targets) {
    await open(page, "/", "Dashboard");
    await card(page, title).click();
    await navExpect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
  }
});

test("Needs attention items open the record they are about", async ({ page }) => {
  await open(page, "/", "Dashboard");
  const attention = panel(page, "Needs attention");

  // Replacement: the handover sheet for the outgoing worker named in the item.
  const repl = attention.getByRole("link", { name: /^No reliever assigned/ });
  const outgoing = (await repl.innerText()).match(/\(([A-Z]{3}-\d{4})\)/)![1];
  const replHref = (await repl.getAttribute("href"))!;
  await repl.click();
  await navExpect(page).toHaveURL(replHref);
  const replSheet = page.getByRole("dialog");
  await expect(replSheet.getByRole("heading", { name: /^Handover · / })).toBeVisible();
  await expect(replSheet).toContainText(outgoing);
  await expect(replSheet).toContainText("Not assigned");

  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  // Extra duty: the request's sheet, titled with its worker.
  const xd = attention.getByRole("link", { name: /^Extra duty awaiting approval/ });
  const worker = (await xd.innerText()).match(/\(([A-Z]{3}-\d{4})\)/)![1];
  const xdHref = (await xd.getAttribute("href"))!;
  await xd.click();
  await navExpect(page).toHaveURL(xdHref);
  await expect(page.getByRole("dialog").getByRole("heading", { name: `Extra duty · ${worker}` })).toBeVisible();
});

test("a contractor admin sees only their own contractor", async ({ page }) => {
  await viewAs(page, { role: "CONTRACTOR_ADMIN", name: "Pooja Agencies admin", contractorId: "c-pooja" });
  await open(page, "/", "Dashboard");

  await expect(page.getByRole("main").getByText(/Work date .* Showing Pooja Agencies only\./)).toBeVisible();
  await expect(page.getByRole("banner").getByText(/^Contractor view: only Pooja Agencies workers/)).toBeVisible();
  // One contractor, so the bars split by department instead.
  await expect(page.getByRole("heading", { level: 2, name: "Present vs approved by department" })).toBeVisible();

  const rows = panel(page, "Department strength").locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) await expect(row.locator("td").first()).toHaveText("Pooja Agencies");

  await expect(card(page, "Active workforce")).toContainText("1 contractor · 1 department");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Audit log" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);
});
