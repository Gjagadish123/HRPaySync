import { expect, open, overflowX, test } from "./fixtures";

test("every screen loads with its title and no sideways scroll", async ({ page }) => {
  const screens: [string, string][] = [
    ["/", "Dashboard"],
    ["/board", "Shift board"],
    ["/attendance", "Attendance"],
    ["/extra-duty", "Extra duty"],
    ["/replacements", "Replacements"],
    ["/roster", "Roster"],
    ["/workers", "Workers"],
    ["/contractors", "Contractors"],
    ["/shifts", "Shifts"],
    ["/devices", "Devices"],
    ["/holidays", "Holidays"],
    ["/reports", "Reports"],
    ["/audit", "Audit log"],
    ["/settings", "Settings"],
  ];
  for (const [path, title] of screens) {
    await open(page, path, title);
    await expect(page.getByRole("main")).toHaveCount(1);
    expect(await overflowX(page), `${path} scrolls sideways`).toBe(0);
  }
});
