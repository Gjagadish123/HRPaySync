import type { Locator } from "@playwright/test";
import { expect, latestToast, open, test } from "./fixtures";

const status = (dialog: Locator) => dialog.locator('[data-slot="badge"]').first();

test("assigning and confirming a reliever for an uncovered handover", async ({ page }) => {
  await page.goto("/replacements#rp-t3"); // a hash-opened sheet is modal, so the h1 is hidden from the a11y tree
  const d = page.getByRole("dialog", { name: /^Handover · / });
  await expect(status(d)).toHaveText("Not assigned");

  const assign = d.getByRole("button", { name: "Assign reliever" });
  await expect(assign).toBeDisabled();
  const reliever = d.getByLabel("Reliever");
  const pick = await reliever.locator("option:not([disabled]):not([value=''])").first().getAttribute("value");
  await reliever.selectOption(pick!);
  await expect(assign).toBeEnabled();

  await assign.click();
  await expect(latestToast(page)).toContainText("Reliever assigned. They count as present only after their punch.");
  await expect(status(d)).toHaveText("Assigned");
  await expect(d.getByText(pick!, { exact: true })).toBeVisible();

  await d.getByRole("button", { name: "Confirm reliever" }).click();
  await expect(latestToast(page)).toContainText("Reliever confirmed.");
  await expect(status(d)).toHaveText("Confirmed");
  await expect(d.getByRole("button", { name: "Confirm reliever" })).toHaveCount(0);

  // The table row reflects the new state once the sheet is closed.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row").filter({ hasText: pick! })).toContainText("Confirmed");
});

test("creating a replacement needs a shift and opens the new handover", async ({ page }) => {
  await open(page, "/replacements", "Replacements");
  const before = await page.getByRole("row").count();
  await page.getByRole("button", { name: "New replacement" }).click();
  const sheet = page.getByRole("dialog", { name: "New replacement" });

  await sheet.getByRole("button", { name: "Create replacement" }).click();
  await expect(sheet.getByText("Choose the outgoing worker's shift.")).toBeVisible();

  const shift = sheet.getByLabel("Outgoing worker's shift");
  const first = await shift.locator("option:not([value=''])").first().getAttribute("value");
  await shift.selectOption(first!);
  await expect(sheet.getByText("Reliever due at handover")).toBeVisible();
  await sheet.getByRole("button", { name: "Create replacement" }).click();

  await expect(latestToast(page)).toContainText("Replacement created. Assign a reliever next.");
  const d = page.getByRole("dialog", { name: /^Handover · / });
  await expect(status(d)).toHaveText("Not assigned");
  await expect(d.getByRole("button", { name: "Assign reliever" })).toBeDisabled();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("row")).toHaveCount(before + 1);
});
