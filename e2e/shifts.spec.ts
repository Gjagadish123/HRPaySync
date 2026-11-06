import type { Page } from "@playwright/test";
import { expect, latestToast, open, test, viewAs } from "./fixtures";

// Demo shifts: D Day 12h 08:00–20:00, N Night 12h 20:00–08:00, G General 09:00–18:00, all with a 1h break.
// "Today" is Thu 5 Nov 12:00, so D and G have been worked; N runs tonight.
const row = (page: Page, name: string) => page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) });
const sheet = (page: Page, name: string) => page.getByRole("dialog", { name });
const summary = (page: Page) => page.getByText(/^\d+ shifts? · \d+ active\./);
const setButton = (page: Page, code: string) => page.getByRole("button", { name: `Set ${code}`, exact: true });

async function createShift(page: Page, f: { code: string; name: string; start?: string; end?: string; breakMins?: string }) {
  await page.getByRole("button", { name: "New shift" }).click();
  const form = sheet(page, "New shift");
  await form.getByLabel("Code", { exact: true }).fill(f.code);
  await form.getByLabel("Name", { exact: true }).fill(f.name);
  if (f.start) await form.getByLabel("Start", { exact: true }).fill(f.start);
  if (f.end) await form.getByLabel("End", { exact: true }).fill(f.end);
  if (f.breakMins) await form.getByLabel("Break (minutes)").fill(f.breakMins);
  await form.getByRole("button", { name: "Create shift" }).click();
  await expect(form).toHaveCount(0);
}

test("the shift table lists D, N and G with timings, hours and rostered counts", async ({ page }) => {
  await open(page, "/shifts", "Shifts");
  await expect(summary(page)).toHaveText(/^3 shifts · 3 active\./);
  // Shift, Timing, Length, Break, Net, Today, Next 7 days, Status, Actions.
  await expect(row(page, "Day 12h").getByRole("cell")).toHaveText([/Day 12h/, "08:00–20:00", "12h", "1h", "11h", "75", "89", "Active", /Edit.*Deactivate/]);
  await expect(row(page, "Night 12h").getByRole("cell")).toHaveText([/Night 12h/, /^20:00–08:00\s*Crosses midnight$/, "12h", "1h", "11h", "73", "83", "Active", /Edit.*Deactivate/]);
  await expect(row(page, "General").getByRole("cell")).toHaveText([/General/, "09:00–18:00", "9h", "1h", "8h", "6", "7", "Active", /Edit.*Deactivate/]);
  // Only the night shift is tagged as crossing midnight.
  await expect(page.getByRole("table").getByText("Crosses midnight")).toHaveCount(1);
});

test("New shift validates code, name, length and break, and shows when it crosses midnight", async ({ page }) => {
  await open(page, "/shifts", "Shifts");
  await page.getByRole("button", { name: "New shift" }).click();
  const form = sheet(page, "New shift");
  const code = form.getByLabel("Code", { exact: true });
  const name = form.getByLabel("Name", { exact: true });
  const start = form.getByLabel("Start", { exact: true });
  const end = form.getByLabel("End", { exact: true });
  const brk = form.getByLabel("Break (minutes)");
  const create = form.getByRole("button", { name: "Create shift" });
  await expect(start).toHaveValue("06:00");
  await expect(end).toHaveValue("18:00");
  await expect(brk).toHaveValue("60");

  // Errors appear after the first save attempt.
  await expect(form.getByText("Enter a code, like D or N2.")).toHaveCount(0);
  await create.click();
  await expect(form.getByText("Enter a code, like D or N2.")).toBeVisible();
  await expect(form.getByText("Enter a name for the shift, like Day 12h.")).toBeVisible();
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expect(code).toBeFocused();

  // Code: format and uniqueness (case-insensitive).
  await code.fill("D-1");
  await expect(form.getByText("Use 1–3 letters or digits, like D or N2.")).toBeVisible();
  await code.fill("d");
  await expect(form.getByText("D is already used by Day 12h.")).toBeVisible();
  await code.fill("E");
  await expect(code).not.toHaveAttribute("aria-invalid", "true");

  // Name: at least 2 characters and not another shift's name.
  await name.fill("X");
  await expect(form.getByText("Enter a name for the shift, like Day 12h.")).toBeVisible();
  await name.fill("night 12H");
  await expect(form.getByText("Another shift already has this name.")).toBeVisible();
  await name.fill("Evening");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");

  // Length: 1 to 16 hours, end different from start.
  await start.fill("08:00");
  await end.fill("08:00");
  await expect(form.getByText("End must be different from start.")).toBeVisible();
  await end.fill("08:30");
  await expect(form.getByText("A shift must be at least 1 hour long; this one is 30m.")).toBeVisible();
  await start.fill("06:00");
  await end.fill("23:00");
  await expect(form.getByText("A shift can be at most 16 hours long; this one is 17h.")).toBeVisible();
  await expect(end).toHaveAttribute("aria-invalid", "true");

  // Break: whole minutes 0–180 and shorter than the shift.
  await end.fill("07:00");
  await expect(end).not.toHaveAttribute("aria-invalid", "true");
  await expect(form.getByText("The break must be shorter than the shift (1h).")).toBeVisible();
  await brk.fill("200");
  await expect(form.getByText("Enter whole minutes from 0 to 180.")).toBeVisible();
  await brk.fill("30");
  await expect(brk).not.toHaveAttribute("aria-invalid", "true");

  // Live "crosses midnight" note and the hours summary follow the timings.
  const crosses = form.getByText(/^Crosses midnight/);
  await expect(crosses).toHaveCount(0);
  await start.fill("22:00");
  await end.fill("06:00");
  await expect(crosses).toHaveText("Crosses midnight: starts 22:00, ends 06:00 the next day.");
  await expect(form.getByRole("definition")).toHaveText(["8h", "30m", "7h 30m"]);
  await end.fill("23:30");
  await expect(crosses).toHaveCount(0);
  await expect(form.getByRole("definition")).toHaveText(["1h 30m", "30m", "1h"]);

  // Cancel keeps the list unchanged.
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toHaveCount(0);
  await expect(summary(page)).toHaveText(/^3 shifts · 3 active\./);
  await expect(row(page, "Evening")).toHaveCount(0);
});

test("a new shift S is listed and can be set in the Roster", async ({ page }) => {
  await open(page, "/roster", "Roster");
  await expect(setButton(page, "S")).toHaveCount(0);

  await open(page, "/shifts", "Shifts");
  await createShift(page, { code: "s", name: "Split 12h" });
  await expect(latestToast(page)).toContainText("Shift S created. It can now be set in the Roster.");
  await expect(summary(page)).toHaveText(/^4 shifts · 4 active\./);
  await expect(row(page, "Split 12h").getByRole("cell")).toHaveText([/^S\s*Split 12h$/, "06:00–18:00", "12h", "1h", "11h", "0", "0", "Active", /Edit.*Deactivate/]);

  await open(page, "/roster", "Roster");
  const cell = page.getByRole("button", { name: /^MAY-0001 Sun 8 Nov:/ });
  await cell.click();
  await setButton(page, "S").click();
  await expect(latestToast(page)).toContainText("1 roster cell set to S.");
  await expect(cell).toHaveAttribute("aria-label", /^MAY-0001 Sun 8 Nov: S/);
  // The roster legend lists the new shift too.
  await expect(page.getByText("Split 12h")).toBeVisible();
});

test("a worked shift's timings are locked, while its name and break can change", async ({ page }) => {
  await open(page, "/shifts", "Shifts");
  await page.getByRole("button", { name: "Edit shift D" }).click();
  const form = sheet(page, "Edit shift D");
  const lock = "Already used from Thu 1 Oct; create a new shift to change timings.";
  await expect(form.getByLabel("Code", { exact: true })).toBeDisabled();
  await expect(form.getByLabel("Code", { exact: true })).toHaveValue("D");
  for (const label of ["Start", "End"]) {
    const input = form.getByLabel(label, { exact: true });
    await expect(input).toBeDisabled();
    await expect(input).toHaveAccessibleDescription(lock);
  }
  await expect(form.getByText(lock)).toBeVisible();

  await form.getByLabel("Name", { exact: true }).fill("Day shift 12h");
  await form.getByLabel("Break (minutes)").fill("45");
  await expect(form.getByRole("definition")).toHaveText(["12h", "45m", "11h 15m"]);
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(latestToast(page)).toContainText("Shift D updated.");
  await expect(form).toHaveCount(0);

  const d = row(page, "Day shift 12h");
  await expect(d.getByRole("cell")).toHaveText([/Day shift 12h/, "08:00–20:00", "12h", "45m", "11h 15m", "75", "89", "Active", /Edit/]);
  await page.reload();
  await expect(d.getByRole("cell").nth(4)).toHaveText("11h 15m");
  await expect(row(page, "Day 12h")).toHaveCount(0);
});

test("an unused shift's timings can still be changed", async ({ page }) => {
  await open(page, "/shifts", "Shifts");
  await createShift(page, { code: "E", name: "Evening 8h", start: "14:00", end: "22:00", breakMins: "30" });
  await expect(row(page, "Evening 8h").getByRole("cell").nth(1)).toHaveText("14:00–22:00");

  await page.getByRole("button", { name: "Edit shift E" }).click();
  const form = sheet(page, "Edit shift E");
  const start = form.getByLabel("Start", { exact: true });
  const end = form.getByLabel("End", { exact: true });
  await expect(start).toBeEnabled();
  await expect(end).toBeEnabled();
  await expect(form.getByText(/^Already used from/)).toHaveCount(0);

  await start.fill("22:00");
  await end.fill("06:00");
  await expect(form.getByText("Crosses midnight: starts 22:00, ends 06:00 the next day.")).toBeVisible();
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(latestToast(page)).toContainText("Shift E updated.");

  await page.reload();
  await expect(row(page, "Evening 8h").getByRole("cell")).toHaveText([/Evening 8h/, /^22:00–06:00\s*Crosses midnight$/, "8h", "30m", "7h 30m", "0", "0", "Active", /Edit/]);
});

test("deactivating a shift asks first, takes it out of the Roster and keeps existing cells; Activate brings it back", async ({ page }) => {
  await open(page, "/shifts", "Shifts");
  const n = row(page, "Night 12h");
  const confirm = page.getByRole("dialog", { name: "Deactivate shift N?" });
  const warning = "It will no longer be offered in the Roster. Past attendance is kept. 458 future roster cells still use it; they stay until changed in the Roster.";

  // Cancel leaves it active.
  await page.getByRole("button", { name: "Deactivate shift N" }).click();
  await expect(confirm).toContainText(warning);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(n.getByRole("cell").nth(7)).toHaveText("Active");

  await page.getByRole("button", { name: "Deactivate shift N" }).click();
  await confirm.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(latestToast(page)).toContainText("Shift N deactivated. 458 future roster cells still use it; they stay until changed in the Roster.");
  await expect(n.getByRole("cell").nth(7)).toHaveText("Inactive");
  await expect(summary(page)).toHaveText(/^3 shifts · 2 active\./);
  await expect(page.getByRole("button", { name: "Activate shift N" })).toBeVisible();

  await open(page, "/roster", "Roster");
  await expect(setButton(page, "D")).toBeVisible();
  await expect(setButton(page, "N")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^MAY-0002 Fri 6 Nov:/ })).toHaveAttribute("aria-label", "MAY-0002 Fri 6 Nov: N");
  await expect(page.getByText("Night 12h (inactive)")).toBeVisible();

  await open(page, "/shifts", "Shifts");
  await page.getByRole("button", { name: "Activate shift N" }).click();
  await expect(latestToast(page)).toContainText("Shift N is active and can be set in the Roster.");
  await expect(n.getByRole("cell").nth(7)).toHaveText("Active");

  await open(page, "/roster", "Roster");
  await expect(setButton(page, "N")).toBeVisible();
  await expect(page.getByText("Night 12h (inactive)")).toHaveCount(0);
});

for (const viewer of [
  { role: "AUDITOR", name: "Auditor" },
  { role: "CONTRACTOR_ADMIN", name: "Pooja Agencies admin", contractorId: "c-pooja" },
] as const) {
  test(`${viewer.name} sees the shifts read-only`, async ({ page }) => {
    await viewAs(page, viewer);
    await open(page, "/shifts", "Shifts");
    await expect(page.getByRole("note").filter({ hasText: "Read-only." })).toHaveText("Read-only. Only client admins and supervisors can create or change shifts.");
    await expect(row(page, "Day 12h").getByRole("cell").nth(1)).toHaveText("08:00–20:00");
    await expect(page.getByRole("button", { name: "New shift" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Edit|Deactivate|Activate) shift/ })).toHaveCount(0);
    await expect(page.getByText(/count workers rostered on each shift/)).toHaveText(
      viewer.role === "CONTRACTOR_ADMIN" ? /each shift from your contractor\./ : /each shift\. Set shifts/,
    );
  });
}

test("a supervisor can create shifts", async ({ page }) => {
  await viewAs(page, { role: "CLIENT_SUPERVISOR", name: "Shift supervisor" });
  await open(page, "/shifts", "Shifts");
  await expect(page.getByRole("note").filter({ hasText: "Read-only." })).toHaveCount(0);
  await createShift(page, { code: "G2", name: "General short", start: "09:00", end: "17:00", breakMins: "30" });
  await expect(latestToast(page)).toContainText("Shift G2 created.");
  await expect(row(page, "General short").getByRole("cell").nth(4)).toHaveText("7h 30m");
});
