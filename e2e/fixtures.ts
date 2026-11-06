import { test as base, expect, type Page } from "@playwright/test";

/** Every test runs at 12:00 IST on Thu 5 Nov 2026, so the generated demo data and "today" are fixed. */
export const NOW = new Date("2026-11-05T06:30:00Z");
export const TODAY = "2026-11-05";

type Viewer =
  | { role: "CLIENT_ADMIN" | "CLIENT_SUPERVISOR" | "ACCOUNTS" | "AUDITOR"; name: string }
  | { role: "CONTRACTOR_ADMIN"; name: string; contractorId: string };

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({}, run) => {
      await run([]);
    },
    { scope: "test" },
  ],
  page: async ({ page, consoleErrors }, run) => {
    page.on("console", (m) => {
      // A deliberate visit to a missing route logs the 404 of the document itself.
      if (m.type() === "error" && !/status of 404/.test(m.text())) consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    await page.clock.setFixedTime(NOW);
    await run(page);
    expect(consoleErrors, "no console errors or uncaught exceptions").toEqual([]);
  },
});

export { expect };

/** Open a route and wait until the demo data has loaded (the page title is rendered). */
export async function open(page: Page, path: string, title?: string | RegExp) {
  await page.goto(path);
  await expect(title ? page.getByRole("heading", { level: 1, name: title }) : page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

/** Sign in as a demo role (the role switcher stands in for login). Call before `open`. */
export async function viewAs(page: Page, viewer: Viewer) {
  await page.goto("/");
  await page.evaluate((v) => localStorage.setItem("cm-demo:v2:viewer", JSON.stringify(v)), viewer);
}

/** The newest toast. */
export const latestToast = (page: Page) => page.locator("[data-sonner-toast][data-index='0']");

/** Horizontal page overflow in px (0 means nothing scrolls sideways). */
export const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
