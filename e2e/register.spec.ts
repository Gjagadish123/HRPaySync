import type { Locator, Page } from "@playwright/test";
import { expect, overflowX, test, TODAY, viewAs } from "./fixtures";

// The monthly register: the default view of /attendance. Today is Thu 5 Nov 2026; the demo data starts in October.
const navExpect = expect.configure({ timeout: 30_000 });

const register = (page: Page, month = "Nov 2026") => page.getByRole("table", { name: new RegExp(`^Attendance register for ${month}`) });
const workerCount = (page: Page) => page.getByText(/^\d+( of \d+)? workers?$/);
const views = (page: Page) => page.getByRole("radiogroup", { name: "Attendance view" });
const rowOf = (table: Locator, code: string) => table.getByRole("row").filter({ has: table.page().getByRole("rowheader", { name: code, exact: true }) });
/** The floating day card. It repeats what the cell's label says, so it is hidden from assistive tech. */
const dayCard = (page: Page) => page.locator("body > div.fixed.pointer-events-none[aria-hidden]");
/** Rostered, Present, Late, Missing OUT, Absent, Rest, Holidays, Extra duty, Rate: the last nine cells of a row. */
const summaryOf = async (row: Locator) => (await row.getByRole("cell").allInnerTexts()).slice(-9).map((t) => t.trim());

/** Like `open`, with room for the demo data and ~5,500 day cells to build while the shared server is busy. */
async function load(page: Page, path: string, title: string) {
  await page.goto(path);
  await navExpect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

/**
 * Wait for the grid, a deferred render of ~5,500 cells, to show `month`. An expect() polling for a table that is not
 * there yet starves that render (20s+ per month switch under load), so wait with waitFor, then assert.
 */
async function showsMonth(page: Page, month = "Nov 2026") {
  await register(page, month).waitFor({ timeout: 30_000 });
  await expect(register(page, month)).toBeVisible();
}

async function openRegister(page: Page) {
  await load(page, "/attendance", "Attendance");
  await showsMonth(page);
}

async function toOctober(page: Page) {
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Oct 2026" })).toBeVisible();
  // The grid follows the month header as a deferred render of ~5,500 cells.
  await showsMonth(page, "Oct 2026");
}

test("opens on the monthly register; months step back to October and never past this month", async ({ page }) => {
  await openRegister(page);
  await expect(views(page).getByRole("radio", { name: "Monthly register" })).toHaveAttribute("aria-checked", "true");
  await expect(views(page).getByRole("radio", { name: "Daily list" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByLabel("Work date")).toHaveCount(0);

  await expect(page.getByRole("heading", { level: 2, name: "Nov 2026" })).toBeVisible();
  await expect(page.getByText("Totals up to today, Thu 5 Nov")).toBeVisible();
  await expect(workerCount(page)).toHaveText("179 workers");
  await expect(register(page).getByRole("row").filter({ has: page.getByRole("rowheader") })).toHaveCount(179);
  // 30 day columns between Name and the nine totals; today is marked for screen readers.
  await expect(register(page).getByRole("columnheader")).toHaveCount(2 + 30 + 9);
  await expect(register(page).getByRole("columnheader", { name: /^5\s*Th\s*, today$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next month" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "This month" })).toHaveCount(0);

  await toOctober(page);
  await expect(page.getByText("Totals for the whole month")).toBeVisible();
  await expect(register(page, "Oct 2026").getByRole("columnheader")).toHaveCount(2 + 31 + 9);
  await expect(page.getByRole("button", { name: "Next month" })).toBeEnabled();
  // October is the first month with data.
  await expect(page.getByRole("button", { name: "Previous month" })).toBeDisabled();

  await page.getByRole("button", { name: "This month" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Nov 2026" })).toBeVisible();
  await showsMonth(page);
  await expect(page.getByRole("button", { name: "Next month" })).toBeDisabled();
});

test("filters narrow the rows and the count reads N of M workers", async ({ page }) => {
  await openRegister(page);
  const table = register(page);
  const codes = table.getByRole("rowheader");
  const search = page.getByRole("searchbox", { name: "Worker" });
  const rows = table.getByRole("row").filter({ has: page.getByRole("rowheader") });

  // Search matches the code, the name and the face-device enrolment ID.
  await search.fill("jag-0601");
  await expect(workerCount(page)).toHaveText("1 of 179 workers");
  await expect(codes).toHaveText(["JAG-0601"]);
  await search.fill("10601");
  await expect(workerCount(page)).toHaveText("1 of 179 workers");
  await expect(codes).toHaveText(["JAG-0601"]);
  await search.fill("Imran");
  await expect(workerCount(page)).not.toHaveText("1 of 179 workers");
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0);
  const imrans = await codes.count();
  await expect(workerCount(page)).toHaveText(`${imrans} of 179 workers`);
  for (const row of await rows.all()) await expect(row.getByRole("cell").first()).toContainText("Imran");
  await search.fill("");
  await expect(workerCount(page)).toHaveText("179 workers");

  const filter = (name: string) => page.getByRole("combobox", { name, exact: true });
  /** Apply one filter to the unfiltered grid and wait until the grid (a deferred render) has caught up. */
  async function only(name: string, label: string) {
    await expect(workerCount(page)).toHaveText("179 workers");
    await filter(name).selectOption({ label });
    await expect(workerCount(page)).toHaveText(/^\d+ of 179 workers$/);
    await expect(page.locator("[aria-busy='true']")).toHaveCount(0);
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    await expect(workerCount(page)).toHaveText(`${n} of 179 workers`);
    return rows.all();
  }

  const pooja = await only("Contractor", "Pooja Agencies");
  for (const row of pooja) await expect(row.getByRole("rowheader")).toHaveText(/^POO-\d{4}$/);
  await filter("Contractor").selectOption({ label: "All contractors" });

  for (const row of await only("Department", "Gardening")) await expect(row.getByRole("cell").first()).toContainText("· Gardening");
  await filter("Department").selectOption({ label: "All departments" });

  // Every row kept by a filter has a day that matches it.
  for (const row of await only("Shift", "G · 09:00–18:00")) await expect(row.getByRole("button", { name: /, G shift 09:00–18:00/ }).first()).toBeAttached();
  await filter("Shift").selectOption({ label: "All shifts" });

  for (const row of await only("Has a day that is", "Absent")) await expect(row.getByRole("button", { name: /^[^,]+, [^:]+: Absent/ }).first()).toBeAttached();

  // Combined with a worker who was never absent this month: nothing left.
  await search.fill("JAG-0601");
  await expect(workerCount(page)).toHaveText("0 of 179 workers");
  await expect(page.getByText("No workers match these filters")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("hovering a day shows its detail card; clicking opens that shift", async ({ page }) => {
  await openRegister(page);
  const row = rowOf(register(page), "JAG-0601");
  // Out at 20:12 without an extra-duty request: worked past the shift, but not extra duty.
  const day = row.getByRole("button", {
    name: "Imran R, Wed 4 Nov: Present, D shift 08:00–20:00, IN 08:04, OUT 20:12, worked past shift without an extra-duty request",
  });
  await expect(day).toBeVisible();
  // The icon is drawn in the status colour on a matching tint.
  await expect(day.locator("use").first()).toHaveAttribute("href", "#att-reg-PRESENT");

  await day.hover();
  const card = dayCard(page);
  await expect(card).toBeVisible();
  await expect(card).toContainText("JAG-0601");
  await expect(card).toContainText("Imran R");
  await expect(card).toContainText("Wed 4 Nov");
  await expect(card).toContainText("Present");
  await expect(card.locator("dl")).toContainText(/Shift\s*Day 12h · 08:00–20:00/);
  await expect(card.locator("dl")).toContainText(/IN\s*08:04\s*OUT\s*20:12/);
  await expect(card.locator("dl")).toContainText(/Worked past shift\s*12m \(no extra-duty request\)/);
  await expect(card.locator("dl")).not.toContainText("Extra duty");
  await expect(card.locator("dl")).toContainText(/Client\s*Not verified/);
  await expect(card.locator("dl")).toContainText(/Devices\s*FD-1/);
  // Placed beside the cell, not over it.
  const [cellBox, cardBox] = [await day.boundingBox(), await card.boundingBox()];
  expect(cardBox!.x).toBeGreaterThanOrEqual(cellBox!.x + cellBox!.width);

  // Another day: the one card moves to it.
  await row.getByRole("button", { name: /^Imran R, Thu 5 Nov: On duty now/ }).hover();
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Thu 5 Nov");
  await expect(card).toContainText("On duty now");
  await expect(card.locator("dl")).toContainText(/OUT\s*On duty/);

  // Days beyond the roster have no card; leaving the grid hides it.
  await row.getByRole("button", { name: "Imran R, Thu 12 Nov: no roster yet" }).hover();
  await expect(card).toHaveCount(0);
  await day.hover();
  await expect(card).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Attendance" }).hover();
  await expect(card).toHaveCount(0);

  // A rest day has no shift to open: it is marked disabled and a click does nothing.
  const rest = row.getByRole("button", { name: "Imran R, Sun 1 Nov: Week off / rest" });
  await expect(rest).toBeDisabled();
  await rest.click({ force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await day.click();
  const sheet = page.getByRole("dialog", { name: "D shift · Wed 4 Nov" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Punches" })).toBeVisible();
  await expect(sheet).toContainText("Imran R");
  await expect(card).toHaveCount(0);
});

test("the Extra duty marker and total count extra-duty requests and extra shifts, never plain overstay", async ({ page }) => {
  await openRegister(page);
  const table = register(page);
  const card = dayCard(page);
  const rowFor = (day: Locator) => day.locator("xpath=ancestor::tr[1]");

  // An approved extension (the reliever came late): 3h 15m past the shift end is marked and totalled.
  const extension = table.getByRole("button", { name: /, Wed 4 Nov: Present, D shift 08:00–20:00, IN 07:55, OUT 23:15, extra duty/ });
  await expect(extension).toHaveCount(1);
  await extension.hover();
  await expect(card.locator("dl")).toContainText(/Extra duty\s*\+3h 15m past shift end/);
  expect((await summaryOf(rowFor(extension)))[7]).toBe("3h 15m");

  // Worked on to 22:10 after the request was rejected: time past the shift, but no extra duty.
  const rejected = table.getByRole("button", {
    name: /, Mon 2 Nov: Present, D shift 08:00–20:00, IN 07:57, OUT 22:10, worked past shift without an extra-duty request/,
  });
  await expect(rejected).toHaveCount(1);
  await rejected.hover();
  await expect(card.locator("dl")).toContainText(/Worked past shift\s*2h 10m \(no extra-duty request\)/);
  await expect(card.locator("dl")).not.toContainText("Extra duty");
  expect((await summaryOf(rowFor(rejected)))[7]).toBe("—");

  // The marker filter keeps only the four workers with a request or an extra shift this month.
  await page.getByRole("combobox", { name: "Has a day that is", exact: true }).selectOption({ label: "Extra duty" });
  await expect(workerCount(page)).toHaveText("4 of 179 workers");
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0);
  const rows = table.getByRole("row").filter({ has: page.getByRole("rowheader") });
  await expect(rows).toHaveCount(4);
  for (const r of await rows.all()) await expect(r.getByRole("button", { name: /, extra duty(,|$)/ }).first()).toBeAttached();
  await expect(rowOf(table, "JAG-0601")).toHaveCount(0);
});

test("keyboard: one tab stop, arrow keys move between days, the card follows, Enter opens the shift", async ({ page }) => {
  await openRegister(page);
  const table = register(page);
  const card = dayCard(page);
  const first = rowOf(table, "JAG-0601");
  const second = rowOf(table, "JAG-0602");

  // Tab from the last filter lands on the grid's single tab stop: the first worker's first day.
  await page.getByRole("searchbox", { name: "Worker" }).focus();
  await page.keyboard.press("Tab");
  await expect(first.getByRole("button", { name: "Imran R, Sun 1 Nov: Week off / rest" })).toBeFocused();
  await expect(card).toContainText("Sun 1 Nov");
  await expect(card).toContainText("Week off / rest");
  const start = (await card.boundingBox())!;

  await page.keyboard.press("ArrowRight");
  await expect(first.getByRole("button", { name: /^Imran R, Mon 2 Nov: Present/ })).toBeFocused();
  await expect(card).toContainText("Mon 2 Nov");
  await expect(card.locator("dl")).toContainText(/IN\s*07:55\s*OUT\s*20:14/);
  await expect.poll(async () => (await card.boundingBox())!.x).toBeGreaterThan(start.x);

  await page.keyboard.press("ArrowDown");
  await expect(second.getByRole("button", { name: "Salma V, Mon 2 Nov: Week off / rest" })).toBeFocused();
  await expect(card).toContainText("JAG-0602");
  await expect(card).toContainText("Salma V");
  await expect(card).toContainText("Mon 2 Nov");
  await expect.poll(async () => (await card.boundingBox())!.y).toBeGreaterThan(start.y);

  // Only the focused day is in the tab order.
  await expect(table.locator('button[tabindex="0"]')).toHaveCount(1);

  await page.keyboard.press("End");
  await expect(second.getByRole("button", { name: "Salma V, Mon 30 Nov: no roster yet" })).toBeFocused();
  await expect(card).toHaveCount(0);
  await page.keyboard.press("Home");
  await expect(second.getByRole("button", { name: /^Salma V, Sun 1 Nov: Present, N shift/ })).toBeFocused();
  await expect(card).toContainText("Sun 1 Nov");

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(second.getByRole("button", { name: /^Salma V, Tue 3 Nov: Present, N shift/ })).toBeFocused();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "N shift · Tue 3 Nov" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Salma V");
});

test("a past month's totals add up for a worker and match the day cells", async ({ page }) => {
  await openRegister(page);
  await toOctober(page);
  const table = register(page, "Oct 2026");
  await expect(table.getByRole("columnheader").filter({ hasText: /^[A-Z]/ })).toHaveText([
    "Code",
    "Name",
    "Rostered",
    "Present",
    "Late",
    "Missing OUT",
    "Absent",
    "Rest",
    "Holidays",
    "Extra duty",
    "Rate",
  ]);

  const row = rowOf(table, "JAG-0601");
  const [rostered, present, late, missing, absent, rest, holidays, extra, rate] = await summaryOf(row);
  // Imran worked past the shift on some days, but never under an extra-duty request, so no extra duty.
  expect([rostered, present, late, missing, absent, rest, holidays, extra, rate]).toEqual(["27", "25", "2", "1", "2", "4", "0", "—", "93%"]);
  await expect(row.getByRole("button", { name: /, extra duty/ })).toHaveCount(0);
  expect(await row.getByRole("button", { name: /, worked past shift without an extra-duty request/ }).count()).toBeGreaterThan(0);
  // Every rostered shift in a finished month was either worked or missed.
  expect(Number(present) + Number(absent)).toBe(Number(rostered));
  expect(rate).toBe(`${Math.round((Number(present) / Number(rostered)) * 100)}%`);
  await expect(row.getByRole("button", { name: /^Imran R, [^:]+: Absent/ })).toHaveCount(Number(absent));
  await expect(row.getByRole("button", { name: /^Imran R, [^:]+: Week off \/ rest$/ })).toHaveCount(Number(rest));
  await expect(row.getByRole("button", { name: /^Imran R, [^:]+: Missing OUT/ })).toHaveCount(Number(missing));
});

test("October register totals agree with the daily list for the month", async ({ page }) => {
  await openRegister(page);
  await toOctober(page);
  const totals = await register(page, "Oct 2026")
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.reduce(
        (t, r) => {
          const cells = [...r.children].slice(-9).map((c) => Number(c.textContent));
          return { rows: t.rows + 1, rostered: t.rostered + cells[0], present: t.present + cells[1], late: t.late + cells[2], absent: t.absent + cells[4] };
        },
        { rows: 0, rostered: 0, present: 0, late: 0, absent: 0 },
      ),
    );
  expect(totals.rows).toBe(179);
  expect(totals.present + totals.absent).toBe(totals.rostered);

  await views(page).getByRole("radio", { name: "Daily list" }).click();
  await expect(page).toHaveURL(/[?&]view=list/);
  await page.getByLabel("Work date").fill("2026-10-15");
  await page.getByLabel("Range").selectOption({ label: "Whole month to date" });
  await expect(page.getByText(/^\d+ shifts? · /)).toHaveText(
    new RegExp(`^${totals.rostered} shifts · ${totals.present} present · ${totals.absent} absent · `),
  );
  // Late counts every late arrival, including the days whose OUT punch is missing.
  expect(totals.late).toBeGreaterThan(0);
  await page.getByLabel("Status", { exact: true }).selectOption({ label: "Late arrival" });
  await expect(page.getByText(/^\d+ shifts? · /)).toHaveText(new RegExp(`^${totals.late} shifts · `));
});

test("holiday columns are tinted and named, and the Holidays total counts them", async ({ page }) => {
  await openRegister(page);
  await toOctober(page);
  const table = register(page, "Oct 2026");

  for (const [day, name] of [
    ["2", "Gandhi Jayanti"],
    ["20", "Dussehra"],
  ]) {
    const head = table.getByRole("columnheader", { name: new RegExp(`^${day}\\s*[A-Z][a-z]\\s*, ${name}$`) });
    await expect(head).toHaveAttribute("title", name);
    const plain = table.getByRole("columnheader", { name: new RegExp(`^${Number(day) + 1}\\s*[A-Z][a-z]$`) });
    const bg = (l: Locator) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(await bg(head)).not.toBe(await bg(plain));
    // Each day cell names the holiday; workers not rostered that day show the holiday itself.
    await expect(table.getByRole("button", { name: new RegExp(`, [A-Z][a-z]{2} ${day} Oct \\(${name}\\): `) })).toHaveCount(179);
    await expect(table.getByRole("button", { name: new RegExp(`, [A-Z][a-z]{2} ${day} Oct \\(${name}\\): Holiday$`) }).first()).toBeAttached();
  }

  // The Holidays and Rest totals equal the days shown that way, for every worker.
  const mismatches = await table.locator("tbody tr").evaluateAll((rows) =>
    rows.flatMap((r) => {
      const labels = [...r.querySelectorAll("button[aria-label]")].map((b) => b.getAttribute("aria-label")!);
      const cells = [...r.children].slice(-9).map((c) => Number(c.textContent));
      const holidays = labels.filter((l) => l.endsWith(": Holiday")).length;
      const rest = labels.filter((l) => l.endsWith(": Week off / rest")).length;
      return holidays === cells[6] && rest === cells[5] ? [] : [r.querySelector("th")?.textContent];
    }),
  );
  expect(mismatches).toEqual([]);
});

test("a contractor admin sees only their own workers", async ({ page }) => {
  await viewAs(page, { role: "CONTRACTOR_ADMIN", name: "Pooja Agencies admin", contractorId: "c-pooja" });
  await openRegister(page);
  await expect(page.getByRole("combobox", { name: "Contractor", exact: true })).toHaveCount(0);
  const codes = await register(page).getByRole("rowheader").allInnerTexts();
  expect(codes.length).toBeGreaterThan(0);
  expect(codes.filter((c) => !c.startsWith("POO-"))).toEqual([]);
  await expect(workerCount(page)).toHaveText(`${codes.length} workers`);

  await toOctober(page);
  const october = await register(page, "Oct 2026").getByRole("rowheader").allInnerTexts();
  expect(october.length).toBeGreaterThan(0);
  expect(october.filter((c) => !c.startsWith("POO-"))).toEqual([]);
  await page.getByRole("searchbox", { name: "Worker" }).fill("JAG-0601");
  await expect(page.getByText("No workers match these filters")).toBeVisible();
});

test("at 375px the page does not scroll sideways; the grid scrolls inside its container", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openRegister(page);
  expect(await overflowX(page)).toBe(0);

  const table = register(page);
  const scroller = table.locator("xpath=..");
  const [scrollWidth, clientWidth] = await scroller.evaluate((e) => [e.scrollWidth, e.clientWidth]);
  expect(scrollWidth).toBeGreaterThan(clientWidth);

  await scroller.evaluate((e) => (e.scrollLeft = 600));
  expect(await scroller.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
  expect(await overflowX(page)).toBe(0);
  // The worker code stays pinned at the left edge while the days scroll under it.
  const code = table.getByRole("rowheader", { name: "JAG-0601", exact: true });
  const [codeBox, scrollerBox] = [await code.boundingBox(), await scroller.boundingBox()];
  expect(Math.abs(codeBox!.x - scrollerBox!.x)).toBeLessThanOrEqual(2);
});

test("dashboard links with a date, status or range open the daily list", async ({ page }) => {
  await load(page, "/", "Dashboard");
  await page.locator('section[aria-label="Key figures"]').getByRole("link", { name: "Absent today" }).click();
  await navExpect(page).toHaveURL(`/attendance?date=${TODAY}&status=ABSENT`);
  await expect(views(page).getByRole("radio", { name: "Daily list" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Work date")).toHaveValue(TODAY);
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("ABSENT");
  await expect(page.getByRole("table", { name: /^Attendance register/ })).toHaveCount(0);

  for (const [url, label, value] of [
    ["/attendance?range=month&status=UNVERIFIED", "Range", "month"],
    ["/attendance?status=DISPUTED", "Status", "DISPUTED"],
  ]) {
    await load(page, url, "Attendance");
    await expect(views(page).getByRole("radio", { name: "Daily list" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
    await expect(page.getByText(/^\d+ shifts? · /)).toBeVisible();
  }

  // An explicit view wins over the filters.
  await load(page, "/attendance?view=register&status=ABSENT", "Attendance");
  await expect(views(page).getByRole("radio", { name: "Monthly register" })).toHaveAttribute("aria-checked", "true");
  await showsMonth(page);
});
