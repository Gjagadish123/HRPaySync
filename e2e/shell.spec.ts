import type { Page } from "@playwright/test";
import { expect, latestToast, open, overflowX, test, viewAs } from "./fixtures";

// Client-side navigations fetch the route's RSC payload, which can be slow while the shared server is busy.
const navExpect = expect.configure({ timeout: 30_000 });

const SCREENS: { link: string; path: string; title: string }[] = [
  { link: "Dashboard", path: "/", title: "Dashboard" },
  { link: "Shift board", path: "/board", title: "Shift board" },
  { link: "Attendance", path: "/attendance", title: "Attendance" },
  { link: "Extra duty", path: "/extra-duty", title: "Extra duty" },
  { link: "Replacements", path: "/replacements", title: "Replacements" },
  { link: "Roster", path: "/roster", title: "Roster" },
  { link: "Workers", path: "/workers", title: "Workers" },
  { link: "Contractors", path: "/contractors", title: "Contractors" },
  { link: "Shifts", path: "/shifts", title: "Shifts" },
  { link: "Devices", path: "/devices", title: "Devices" },
  { link: "Holidays", path: "/holidays", title: "Holidays" },
  { link: "Reports", path: "/reports", title: "Reports" },
  { link: "Audit log", path: "/audit", title: "Audit log" },
  { link: "Settings", path: "/settings", title: "Settings" },
];

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const roleButton = (page: Page) => page.getByRole("button", { name: /^Viewing as/ });
const finder = (page: Page) => page.getByRole("dialog", { name: "Find a worker" });
const finderBox = (page: Page) => finder(page).getByRole("combobox", { name: "Worker ID, name or device reference" });

test("the sidebar reaches every screen and marks the current one", async ({ page }) => {
  await open(page, "/settings", "Settings");
  await expect(nav(page).getByRole("link")).toHaveText(SCREENS.map((s) => s.link));

  for (const { link, path, title } of SCREENS) {
    const item = nav(page).getByRole("link", { name: link, exact: true });
    await item.click();
    await navExpect(page).toHaveURL(path);
    await navExpect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(item).toHaveAttribute("aria-current", "page");
    await expect(nav(page).locator("[aria-current=page]")).toHaveCount(1);
  }
});

test("the role menu shows the current role and a new choice persists after reload", async ({ page }) => {
  await open(page, "/", "Dashboard");
  await expect(roleButton(page)).toHaveAccessibleName("Viewing as Plant HR. Change role");
  await expect(roleButton(page)).toContainText("Client admin");

  await roleButton(page).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  // Four client roles plus one per contractor, as radio items so the selection is announced.
  await expect(menu.getByRole("menuitemradio")).toHaveCount(10);
  await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveText("Plant HR · Client admin");

  await menu.getByRole("menuitemradio", { name: "Auditor · Read-only" }).click();
  await expect(menu).toBeHidden();
  await expect(latestToast(page)).toContainText("Now viewing as Auditor");
  await expect(roleButton(page)).toHaveAccessibleName("Viewing as Auditor. Change role");
  await expect(roleButton(page)).toContainText("Auditor, read-only");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(roleButton(page)).toHaveAccessibleName("Viewing as Auditor. Change role");
  await expect(roleButton(page)).toContainText("Auditor, read-only");
  await roleButton(page).click();
  await expect(page.getByRole("menu").getByRole("menuitemradio", { checked: true })).toHaveText("Auditor · Read-only");
});

test("Ctrl+K finds a worker by ID and opens their record; a second search switches the open record", async ({ page }) => {
  await open(page, "/", "Dashboard");

  await page.keyboard.press("Control+k");
  await expect(finder(page)).toBeVisible();
  await expect(finderBox(page)).toBeFocused();
  await finderBox(page).fill("POO-0503");
  await expect(finder(page).getByRole("option")).toHaveCount(1);
  await expect(finder(page).getByRole("option")).toContainText("Parvathi M");
  await finderBox(page).press("Enter");

  await navExpect(page).toHaveURL(/\/workers#POO-0503$/);
  await expect(finder(page)).toBeHidden();
  const sheet = page.getByRole("dialog");
  await navExpect(sheet.getByRole("heading", { name: "POO-0503", exact: true })).toBeVisible();
  await expect(sheet).toContainText("Parvathi M");
  await expect(sheet).toHaveCount(1);

  // Again from inside the open sheet, this time by name and with the mouse.
  await page.keyboard.press("Control+k");
  await expect(finder(page)).toBeVisible();
  await finderBox(page).fill("Abdul D");
  await finder(page).getByRole("option", { name: /POO-0511/ }).click();

  await expect(page).toHaveURL(/\/workers#POO-0511$/);
  await expect(finder(page)).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("dialog").getByRole("heading", { name: "POO-0511", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Abdul D");
});

test("a contractor admin cannot find or open another contractor's worker", async ({ page }) => {
  await viewAs(page, { role: "CONTRACTOR_ADMIN", name: "Pooja Agencies admin", contractorId: "c-pooja" });
  await open(page, "/", "Dashboard");

  await page.getByRole("button", { name: "Find a worker" }).click();
  await finderBox(page).fill("SVM-0303");
  await expect(finder(page).getByText("No worker matches “SVM-0303”.")).toBeVisible();
  await expect(finder(page).getByRole("option")).toHaveCount(0);
  await expect(finderBox(page)).toHaveAttribute("aria-expanded", "false");

  await finderBox(page).fill("POO-0503");
  await expect(finder(page).getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(finder(page)).toBeHidden();

  // A pasted link to the other contractor's worker does not open the record either.
  await page.goto("/workers#SVM-0303");
  await expect(page.getByRole("heading", { level: 1, name: "Workers" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("old /workforce links redirect to Workers and still open the worker in the hash", async ({ page }) => {
  await page.goto("/workforce#POO-0503");
  await expect(page).toHaveURL(/\/workers#POO-0503$/);
  const sheet = page.getByRole("dialog", { name: "POO-0503" });
  await expect(sheet).toContainText("Parvathi M");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Workers" })).toBeVisible();
});

test("every screen has exactly one main and one banner landmark", async ({ page }) => {
  for (const { path, title } of SCREENS) {
    await open(page, path, title);
    await expect(page.getByRole("main"), path).toHaveCount(1);
    await expect(page.getByRole("banner"), path).toHaveCount(1);
    await expect(nav(page), path).toHaveCount(1);
  }
});

for (const viewport of [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
]) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("no screen scrolls sideways", async ({ page }) => {
      for (const { path, title } of SCREENS) {
        await open(page, path, title);
        // Let charts and other measured layout settle for a couple of frames.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        expect(await overflowX(page), `${path} overflows sideways`).toBe(0);
      }
    });
  });
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the sidebar is hidden until Toggle Sidebar opens it, and closes after navigating", async ({ page }) => {
    await open(page, "/", "Dashboard");
    await expect(nav(page)).toBeHidden();

    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    const drawer = page.getByRole("dialog", { name: "Sidebar" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveCount(SCREENS.length);

    await drawer.getByRole("link", { name: "Holidays", exact: true }).click();
    await navExpect(page).toHaveURL("/holidays");
    await navExpect(page.getByRole("heading", { level: 1, name: "Holidays" })).toBeVisible();
    await expect(drawer).toBeHidden();
  });
});

test("an unknown address shows a not-found page that leads back to the dashboard", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();

  await page.getByRole("link", { name: "Back to Dashboard" }).click();
  await navExpect(page).toHaveURL("/");
  await navExpect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
});
