import type { Page } from "@playwright/test";
import { expect, latestToast, open, test, viewAs } from "./fixtures";

// Demo devices: FD-1 Face device 1 at Main gate and FD-2 Face device 2 at Canteen gate, both installed 20 Mar 2026.
const row = (page: Page, code: string) => page.getByRole("row").filter({ has: page.getByText(code, { exact: true }) });
const summary = (page: Page) => page.getByText(/^\d+ devices? · \d+ active\./);
const sources = (page: Page) => page.getByRole("heading", { level: 2, name: "Attendance sources" }).locator("xpath=ancestor::*[@data-slot='card'][1]").getByRole("listitem");

type DeviceInput = { code: string; name: string; location: string; serial: string; ip: string; installedOn?: string };

async function fillDevice(page: Page, d: Partial<DeviceInput>) {
  const form = page.getByRole("dialog", { name: "Add device" });
  if (d.code !== undefined) await form.getByLabel("Device code").fill(d.code);
  if (d.name !== undefined) await form.getByLabel("Name", { exact: true }).fill(d.name);
  if (d.location !== undefined) await form.getByLabel("Location").fill(d.location);
  if (d.serial !== undefined) await form.getByLabel("Serial number").fill(d.serial);
  if (d.ip !== undefined) await form.getByLabel("IP address").fill(d.ip);
  if (d.installedOn !== undefined) await form.getByLabel("Installed on").fill(d.installedOn);
}

test("lists FD-1 and FD-2 with location, type, serial, IP, punch counts and last punch", async ({ page }) => {
  await open(page, "/devices", "Devices");
  await expect(summary(page)).toHaveText(/^2 devices · 2 active\./);
  // Device, Type, Serial no. · IP address, Installed on, Status, Today, Last 7 days, Last punch, Actions.
  await expect(row(page, "FD-1").getByRole("cell")).toHaveText([
    /^FD-1\s*Face device 1\s*Main gate$/,
    /^Face\s*In & out$/,
    /^FD24-118734\s*10\.20\.1\.21$/,
    "20 Mar 2026",
    "Active",
    "182",
    "2385",
    "5 Nov 09:59",
    /Edit\s*Disable/,
  ]);
  await expect(row(page, "FD-2").getByRole("cell")).toHaveText([
    /^FD-2\s*Face device 2\s*Canteen gate$/,
    /^Face\s*In & out$/,
    /^FD24-118752\s*10\.20\.1\.22$/,
    "20 Mar 2026",
    "Active",
    "52",
    "889",
    "5 Nov 12:00",
    /Edit\s*Disable/,
  ]);
  // Manual corrections are listed for reference but are not a device.
  const manual = row(page, "MANUAL");
  await expect(manual).toContainText("Manual correction");
  await expect(manual).toContainText("No punches yet");
  await expect(page.getByRole("button", { name: /device MANUAL/ })).toHaveCount(0);
});

test("Add device validates code, IP, serial number and installation date", async ({ page }) => {
  await open(page, "/devices", "Devices");
  await page.getByRole("button", { name: "Add device" }).click();
  const form = page.getByRole("dialog", { name: "Add device" });
  const submit = form.getByRole("button", { name: "Add device" });
  // Installed on defaults to today.
  await expect(form.getByLabel("Installed on")).toHaveValue("2026-11-05");

  await submit.click();
  for (const msg of [
    "Enter a device code, like FD-3.",
    "Enter a name for the device, like Face device 3.",
    "Enter where the device is installed, like Main gate.",
    "Enter the serial number from the device label.",
    "Enter the device's IP address.",
  ])
    await expect(form.getByText(msg)).toBeVisible();
  await expect(form.getByLabel("Device code")).toBeFocused();

  // Code: format, reserved word and uniqueness (case-insensitive).
  await fillDevice(page, { code: "FD 3" });
  await expect(form.getByText("Use 2–12 capital letters, digits or hyphens, like FD-3.")).toBeVisible();
  await fillDevice(page, { code: "manual" });
  await expect(form.getByText("MANUAL is reserved for manual corrections.")).toBeVisible();
  await fillDevice(page, { code: "fd-1" });
  await expect(form.getByText("FD-1 is already used by Face device 1.")).toBeVisible();

  // IP: a valid IPv4 address no other device uses.
  await fillDevice(page, { ip: "10.20.1.256" });
  await expect(form.getByText("Enter a valid IPv4 address, like 10.20.1.23.")).toBeVisible();
  await fillDevice(page, { ip: "10.20.1" });
  await expect(form.getByText("Enter a valid IPv4 address, like 10.20.1.23.")).toBeVisible();
  await fillDevice(page, { ip: "10.20.1.22" });
  await expect(form.getByText("This IP address is already used by FD-2.")).toBeVisible();

  // Serial number: unique, compared without case.
  await fillDevice(page, { serial: "fd24-118752" });
  await expect(form.getByText("This serial number is already registered to FD-2.")).toBeVisible();

  // Installed on: not in the future.
  await fillDevice(page, { installedOn: "2026-11-06" });
  await expect(form.getByText("The installation date can't be in the future.")).toBeVisible();
  await expect(form.getByLabel("Installed on")).toHaveAttribute("aria-invalid", "true");

  // Fixing every field clears every message.
  await fillDevice(page, { code: "FD-3", name: "Face device 3", location: "Store gate", serial: "FD24-200001", ip: "10.20.1.23", installedOn: "2026-11-05" });
  await expect(form.locator("[aria-invalid='true']")).toHaveCount(0);

  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toHaveCount(0);
  await expect(summary(page)).toHaveText(/^2 devices · 2 active\./);
  await expect(row(page, "FD-3")).toHaveCount(0);
});

test("a new device appears in the table and in Settings → Attendance sources", async ({ page }) => {
  await open(page, "/devices", "Devices");
  await page.getByRole("button", { name: "Add device" }).click();
  const form = page.getByRole("dialog", { name: "Add device" });
  await fillDevice(page, { code: "fd-3", name: "Fingerprint 3", location: "Store gate", serial: "fp25-000123", ip: "10.20.1.23", installedOn: "2026-11-01" });
  await form.getByLabel("Type").selectOption("Fingerprint");
  await form.getByLabel("Direction").selectOption("In");
  await form.getByRole("button", { name: "Add device" }).click();
  await expect(latestToast(page)).toContainText("Device FD-3 added. Punches carrying FD-3 are counted here.");
  await expect(form).toHaveCount(0);

  await expect(summary(page)).toHaveText(/^3 devices · 3 active\./);
  const fd3 = row(page, "FD-3");
  await expect(fd3.getByRole("cell")).toHaveText([
    /^FD-3\s*Fingerprint 3\s*Store gate$/,
    /^Fingerprint\s*In$/,
    /^FP25-000123\s*10\.20\.1\.23$/,
    "1 Nov 2026",
    "Active",
    "0",
    "0",
    "No punches yet",
    /Edit\s*Disable/,
  ]);

  await page.reload();
  await expect(fd3.getByRole("cell").first()).toContainText("Fingerprint 3");

  await open(page, "/settings", "Settings");
  await expect(sources(page)).toHaveText([/^FD-1\s*Face device 1 · Main gate\s*Simulated$/, /^FD-2/, /^FD-3\s*Fingerprint 3 · Store gate\s*Simulated$/, /^MANUAL/]);
});

test("a device's name and location can be edited, and the change is audited", async ({ page }) => {
  await open(page, "/devices", "Devices");
  await page.getByRole("button", { name: "Edit device FD-2" }).click();
  const form = page.getByRole("dialog", { name: "Edit device FD-2" });
  await expect(form.getByLabel("Device code")).toBeDisabled();
  await expect(form.getByLabel("Device code")).toHaveValue("FD-2");
  await expect(form.getByLabel("IP address")).toHaveValue("10.20.1.22");

  // A device with punches can't be dated after its first punch.
  await form.getByLabel("Installed on").fill("2026-11-01");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(form.getByText(/^This device has punches from \w{3} \d{1,2} \w{3}; it must have been installed by then\.$/)).toBeVisible();
  await form.getByLabel("Installed on").fill("2026-03-20");
  await expect(form.locator("[aria-invalid='true']")).toHaveCount(0);

  await form.getByLabel("Name", { exact: true }).fill("Canteen face reader");
  await form.getByLabel("Location").fill("Canteen side gate");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(latestToast(page)).toContainText("Device FD-2 updated.");
  await expect(form).toHaveCount(0);
  const fd2 = row(page, "FD-2").getByRole("cell");
  await expect(fd2.first()).toHaveText(/^FD-2\s*Canteen face reader\s*Canteen side gate$/);
  // The rest of the record and its punch history are unaffected.
  await expect(fd2.nth(2)).toHaveText(/^FD24-118752\s*10\.20\.1\.22$/);
  await expect(fd2.nth(3)).toHaveText("20 Mar 2026");
  await expect(fd2.nth(6)).toHaveText("889");
  await page.reload();
  await expect(fd2.first()).toHaveText(/Canteen face reader/);

  await open(page, "/audit", "Audit log");
  await expect(page.getByRole("cell", { name: "Updated device FD-2: name Face device 2 → Canteen face reader; location Canteen gate → Canteen side gate" })).toBeVisible();
});

test("disabling a device asks first and shows Disabled here and in Settings; it can be enabled again", async ({ page }) => {
  await open(page, "/devices", "Devices");
  const confirm = page.getByRole("dialog", { name: "Disable device FD-2?" });
  const status = row(page, "FD-2").getByRole("cell").nth(4);

  await page.getByRole("button", { name: "Disable device FD-2" }).click();
  await expect(confirm).toContainText(
    "Face device 2 at Canteen gate will be marked disabled. A disabled device's past punches are kept, and you can enable it again at any time.",
  );
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(status).toHaveText("Active");

  await page.getByRole("button", { name: "Disable device FD-2" }).click();
  await confirm.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(latestToast(page)).toContainText("Device FD-2 disabled. Its past punches are kept.");
  await expect(status).toHaveText("Disabled");
  await expect(summary(page)).toHaveText(/^2 devices · 1 active\./);
  await expect(row(page, "FD-2").getByRole("cell").nth(6)).toHaveText("889");

  await open(page, "/settings", "Settings");
  await expect(sources(page).filter({ hasText: "FD-2" })).toHaveText(/Face device 2 · Canteen gate\s*Disabled$/);
  await expect(sources(page).filter({ hasText: "FD-1" })).toHaveText(/Simulated$/);

  await open(page, "/devices", "Devices");
  await page.getByRole("button", { name: "Enable device FD-2" }).click();
  await expect(latestToast(page)).toContainText("Device FD-2 enabled.");
  await expect(status).toHaveText("Active");
  await expect(page.getByRole("button", { name: "Disable device FD-2" })).toBeVisible();
  await expect(summary(page)).toHaveText(/^2 devices · 2 active\./);
});

test("only the client admin manages devices; a supervisor sees them read-only", async ({ page }) => {
  await viewAs(page, { role: "CLIENT_SUPERVISOR", name: "Shift supervisor" });
  await open(page, "/devices", "Devices");
  await expect(page.getByRole("note").filter({ hasText: "Read-only." })).toHaveText("Read-only. Devices are managed by the client admin.");
  await expect(row(page, "FD-1").getByRole("cell").nth(5)).toHaveText("182");
  await expect(page.getByRole("button", { name: "Add device" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Edit|Disable|Enable) device/ })).toHaveCount(0);
  // No actions column for a read-only role.
  await expect(row(page, "FD-1").getByRole("cell")).toHaveCount(8);
});
