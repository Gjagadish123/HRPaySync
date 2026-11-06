"use client";

import { CreditCard, Fingerprint, Pencil, Plus, ScanFace, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "@/components/store";
import { Button, ConfirmDialog as Confirm, Empty, Field, PageHeader, ReadOnlyNote, Sheet, Tag, cx, useToast } from "@/components/app-ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, dateOf, fmtDate, fmtDT } from "@/lib/time";
import type { DateTimeStr, Device } from "@/lib/types";
import { canSeeWorker } from "@/lib/world";

const KIND: Record<Device["kind"], { label: string; icon: LucideIcon }> = {
  FACE: { label: "Face", icon: ScanFace },
  FINGERPRINT: { label: "Fingerprint", icon: Fingerprint },
  CARD: { label: "Card", icon: CreditCard },
};
const DIRECTION: Record<Device["direction"], string> = { IN: "In", OUT: "Out", IN_OUT: "In & out" };
const OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`^${OCTET}(\\.${OCTET}){3}$`);
const NEW = "__new";
const MANUAL = "MANUAL";

type Stats = { today: number; week: number; last: DateTimeStr | null; first: DateTimeStr | null };
type Form = { code: string; name: string; location: string; kind: Device["kind"]; direction: Device["direction"]; serialNo: string; ipAddress: string; installedOn: string };
type Errors = Partial<Record<keyof Form, string>>;

const Code = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cx("inline-block rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] whitespace-nowrap text-muted-foreground", className)}>{children}</span>
);

function check(f: Form, devices: Device[], today: string, firstPunch: DateTimeStr | null, self?: Device): Errors {
  const e: Errors = {};
  const others = devices.filter((d) => d.id !== self?.id);
  if (!self) {
    const code = f.code.trim().toUpperCase();
    const taken = others.find((d) => d.id === code);
    if (!code) e.code = "Enter a device code, like FD-3.";
    else if (!/^[A-Z0-9-]{2,12}$/.test(code)) e.code = "Use 2–12 capital letters, digits or hyphens, like FD-3.";
    else if (code === MANUAL) e.code = "MANUAL is reserved for manual corrections.";
    else if (taken) e.code = `${code} is already used by ${taken.name}.`;
  }
  const name = f.name.trim();
  if (name.length < 2) e.name = "Enter a name for the device, like Face device 3.";
  else if (name.length > 40) e.name = "Keep the name to 40 characters or fewer.";
  const location = f.location.trim();
  if (location.length < 2) e.location = "Enter where the device is installed, like Main gate.";
  else if (location.length > 60) e.location = "Keep the location to 60 characters or fewer.";
  const serial = f.serialNo.trim().toUpperCase();
  const serialTaken = others.find((d) => d.serialNo.toUpperCase() === serial);
  if (!serial) e.serialNo = "Enter the serial number from the device label.";
  else if (!/^[A-Z0-9-]{4,30}$/.test(serial)) e.serialNo = "Use 4–30 letters, digits or hyphens.";
  else if (serialTaken) e.serialNo = `This serial number is already registered to ${serialTaken.id}.`;
  const ip = f.ipAddress.trim();
  const ipTaken = others.find((d) => d.ipAddress === ip);
  if (!ip) e.ipAddress = "Enter the device's IP address.";
  else if (!IPV4.test(ip)) e.ipAddress = "Enter a valid IPv4 address, like 10.20.1.23.";
  else if (ipTaken) e.ipAddress = `This IP address is already used by ${ipTaken.id}.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.installedOn)) e.installedOn = "Choose the installation date.";
  else if (f.installedOn > today) e.installedOn = "The installation date can't be in the future.";
  else if (firstPunch && f.installedOn > dateOf(firstPunch)) e.installedOn = `This device has punches from ${fmtDate(dateOf(firstPunch))}; it must have been installed by then.`;
  return e;
}

/** Confirmation dialog. Opened from state, so it remembers its opener and returns focus there (Radix only does that for a Trigger). */

function DeviceForm({ formId, device, firstPunch, onDone }: { formId: string; device?: Device; firstPunch: DateTimeStr | null; onDone: () => void }) {
  const { world, dispatch } = useStore();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const today = dateOf(world.now);
  const [f, setF] = useState<Form>(() =>
    device
      ? { code: device.id, name: device.name, location: device.location, kind: device.kind, direction: device.direction, serialNo: device.serialNo, ipAddress: device.ipAddress, installedOn: device.installedOn }
      : { code: "", name: "", location: "", kind: "FACE", direction: "IN_OUT", serialNo: "", ipAddress: "", installedOn: today },
  );
  // Errors appear after the first save attempt, then follow every edit.
  const [tried, setTried] = useState(false);
  const errors = tried ? check(f, world.devices, today, firstPunch, device) : {};
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (Object.keys(check(f, world.devices, today, firstPunch, device)).length) {
      setTried(true);
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const next: Device = {
      id: device?.id ?? f.code.trim().toUpperCase(),
      name: f.name.trim(),
      location: f.location.trim(),
      kind: f.kind,
      direction: f.direction,
      serialNo: f.serialNo.trim().toUpperCase(),
      ipAddress: f.ipAddress.trim(),
      installedOn: f.installedOn,
      active: device?.active ?? true,
    };
    if (!device) {
      const res = dispatch({ type: "device/create", device: next }, `Added device ${next.id} ${next.name} at ${next.location} (${next.ipAddress})`);
      if (!res.ok) return toast(res.error, "alert");
      toast(`Device ${next.id} added. Punches carrying ${next.id} are counted here.`);
      return onDone();
    }
    const fields: [keyof Device, string, (d: Device) => string][] = [
      ["name", "name", (d) => d.name],
      ["location", "location", (d) => d.location],
      ["kind", "type", (d) => KIND[d.kind].label],
      ["direction", "direction", (d) => DIRECTION[d.direction]],
      ["serialNo", "serial number", (d) => d.serialNo],
      ["ipAddress", "IP address", (d) => d.ipAddress],
      ["installedOn", "installed on", (d) => d.installedOn],
    ];
    const changes = fields.filter(([k]) => device[k] !== next[k]).map(([, label, show]) => `${label} ${show(device)} → ${show(next)}`);
    if (!changes.length) return onDone();
    const res = dispatch({ type: "device/update", device: next }, `Updated device ${next.id}: ${changes.join("; ")}`);
    if (!res.ok) return toast(res.error, "alert");
    toast(`Device ${next.id} updated.`);
    onDone();
  }

  return (
    <form id={formId} ref={formRef} onSubmit={submit} noValidate aria-label={device ? `Edit device ${device.id}` : "New device"} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        <Field label="Device code" error={errors.code} hint={device ? "Fixed after creation." : "Punches carry this code."}>
          {(p) => <input {...p} className="field font-mono uppercase" autoComplete="off" disabled={!!device} value={f.code} onChange={set("code")} placeholder="FD-3" />}
        </Field>
        <Field label="Name" error={errors.name}>
          {(p) => <input {...p} className="field" autoComplete="off" value={f.name} onChange={set("name")} placeholder="Face device 3" />}
        </Field>
      </div>
      <Field label="Location" error={errors.location}>
        {(p) => <input {...p} className="field" value={f.location} onChange={set("location")} placeholder="Main gate" />}
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          {(p) => (
            <select {...p} className="field" value={f.kind} onChange={set("kind")}>
              {(Object.keys(KIND) as Device["kind"][]).map((k) => (
                <option key={k} value={k}>
                  {KIND[k].label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Direction">
          {(p) => (
            <select {...p} className="field" value={f.direction} onChange={set("direction")}>
              {(Object.keys(DIRECTION) as Device["direction"][]).map((k) => (
                <option key={k} value={k}>
                  {DIRECTION[k]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Serial number" error={errors.serialNo}>
          {(p) => <input {...p} className="field font-mono uppercase" autoComplete="off" value={f.serialNo} onChange={set("serialNo")} placeholder="FD24-118790" />}
        </Field>
        <Field label="IP address" error={errors.ipAddress}>
          {(p) => <input {...p} className="field font-mono" inputMode="decimal" autoComplete="off" value={f.ipAddress} onChange={set("ipAddress")} placeholder="10.20.1.23" />}
        </Field>
      </div>
      <Field label="Installed on" error={errors.installedOn}>
        {(p) => <input {...p} type="date" className="field tabular-nums sm:max-w-[200px]" max={today} value={f.installedOn} onChange={set("installedOn")} />}
      </Field>
    </form>
  );
}

export function DevicesView() {
  const { world, n, viewer, can, dispatch } = useStore();
  const toast = useToast();
  const formId = useId();
  const manage = can("manageDevices");
  const scoped = viewer.role === "CONTRACTOR_ADMIN";
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const stats = useMemo(() => {
    // "Today" is the work date in the header; a night shift's punches after midnight still belong to it.
    const today = world.today;
    const from = addDays(today, -6);
    const out = new Map<string, Stats>();
    const seen = new Set<string>();
    for (const p of world.punches) {
      // A repeated event id from the same source is the same punch delivered twice.
      const key = `${p.source}|${p.eventId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let s = out.get(p.source);
      if (!s) out.set(p.source, (s = { today: 0, week: 0, last: null, first: null }));
      if (!s.first || p.at < s.first) s.first = p.at;
      const d = dateOf(p.at);
      if (scoped) {
        const w = n.worker.get(p.workerId);
        if (!w || !canSeeWorker(viewer, w, d)) continue;
      }
      if (!s.last || p.at > s.last) s.last = p.at;
      if (d >= today) s.today++;
      if (d >= from) s.week++;
    }
    return out;
  }, [world.punches, world.today, n, viewer, scoped]);

  const target = editing === NEW ? undefined : world.devices.find((d) => d.id === editing);
  const disabling = world.devices.find((d) => d.id === confirmId);
  const activeCount = world.devices.filter((d) => d.active).length;

  function setActive(d: Device, active: boolean) {
    const res = dispatch({ type: "device/update", device: { ...d, active } }, `${active ? "Enabled" : "Disabled"} device ${d.id} (${d.name}, ${d.location})`);
    if (!res.ok) return toast(res.error, "alert");
    toast(active ? `Device ${d.id} enabled.` : `Device ${d.id} disabled. Its past punches are kept.`);
  }

  const counts = (s: Stats | undefined) => (
    <>
      <td className="text-right tabular-nums">{s?.today ?? 0}</td>
      <td className="text-right tabular-nums">{s?.week ?? 0}</td>
      <td className="whitespace-nowrap">{s?.last ? <span className="font-mono text-[13px]">{fmtDT(s.last)}</span> : <span className="text-muted-foreground">No punches yet</span>}</td>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Devices"
        description={
          <>
            Punches carry the device&apos;s code and are matched to workers by their Device ID, set on each worker in{" "}
            <Link href="/workers" className="font-medium text-primary underline-offset-4 hover:underline">
              Workers
            </Link>
            .
          </>
        }
        actions={
          manage && (
            <Button kind="tape" onClick={() => setEditing(NEW)}>
              <Plus aria-hidden />
              Add device
            </Button>
          )
        }
      />
      {!manage && <ReadOnlyNote>Devices are managed by the client admin.</ReadOnlyNote>}

      <Card className="gap-0 py-0 shadow-xs">
        <CardHeader className="border-b py-4">
          <CardTitle role="heading" aria-level={2} className="font-semibold">
            Attendance devices
          </CardTitle>
          <CardDescription className="text-[13px]">
            {world.devices.length} device{world.devices.length === 1 ? "" : "s"} · {activeCount} active.{" "}
            {scoped ? "Punch counts include your contractor's workers only." : "Punch counts are distinct events; repeated deliveries are counted once."}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {world.devices.length === 0 && (
            <div className="border-b p-4">
              <Empty title="No devices yet">{manage ? "Add the first device so its punches can be traced." : "The client admin has not added any devices yet."}</Empty>
            </div>
          )}
          {/* relative: sr-only labels inside are absolutely positioned; without it they escape the scroller. */}
          <div className="relative overflow-x-auto">
            <table className="grid-table [&_td]:align-middle">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Type</th>
                  <th>Serial no. · IP address</th>
                  <th>Installed on</th>
                  <th>Status</th>
                  <th className="text-right">Today</th>
                  <th className="text-right">Last 7 days</th>
                  <th>Last punch</th>
                  {manage && (
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {world.devices.map((d) => {
                  const Icon = KIND[d.kind].icon;
                  return (
                    <tr key={d.id} className={cx(!d.active && "text-muted-foreground")}>
                      <td>
                        <span className="flex items-start gap-2.5">
                          <Code className="mt-px">{d.id}</Code>
                          <span className="min-w-0">
                            <span className="block font-medium whitespace-nowrap">{d.name}</span>
                            <span className="block text-[13px] whitespace-nowrap text-muted-foreground">{d.location}</span>
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <Icon className="size-4 text-muted-foreground" aria-hidden />
                          {KIND[d.kind].label}
                        </span>
                        <span className="block text-[13px] text-muted-foreground">{DIRECTION[d.direction]}</span>
                      </td>
                      <td className="font-mono text-[13px] whitespace-nowrap">
                        <span className="block">{d.serialNo}</span>
                        <span className="block text-muted-foreground">{d.ipAddress}</span>
                      </td>
                      <td className="whitespace-nowrap">{fmtDate(d.installedOn, false)} {d.installedOn.slice(0, 4)}</td>
                      <td>
                        <Tag tone={d.active ? "ok" : "muted"}>{d.active ? "Active" : "Disabled"}</Tag>
                      </td>
                      {counts(stats.get(d.id))}
                      {manage && (
                        <td>
                          <span className="flex justify-end gap-1.5">
                            <Button size="sm" aria-label={`Edit device ${d.id}`} onClick={() => setEditing(d.id)}>
                              <Pencil aria-hidden />
                              Edit
                            </Button>
                            <Button size="sm" aria-label={`${d.active ? "Disable" : "Enable"} device ${d.id}`} onClick={() => (d.active ? setConfirmId(d.id) : setActive(d, true))}>
                              {d.active ? "Disable" : "Enable"}
                            </Button>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
                <tr>
                  <td>
                    <span className="flex items-start gap-2.5">
                      <Code className="mt-px bg-accent text-accent-foreground">{MANUAL}</Code>
                      <span className="block font-medium whitespace-nowrap">Manual correction</span>
                    </span>
                  </td>
                  <td colSpan={4} className="min-w-[260px] text-[13px] text-muted-foreground">
                    Authorised corrections, entered on the attendance record with a reason and an approver. Not a device.
                  </td>
                  {counts(stats.get(MANUAL))}
                  {manage && <td />}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={target ? `Edit device ${target.id}` : "Add device"}
        description={target ? `${target.name} · ${target.location}` : "Register an attendance device. Its code is what its punches carry."}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button kind="tape" type="submit" form={formId}>
              {target ? "Save changes" : "Add device"}
            </Button>
          </>
        }
      >
        {editing !== null && (
          <DeviceForm key={editing} formId={formId} device={target} firstPunch={target ? (stats.get(target.id)?.first ?? null) : null} onDone={() => setEditing(null)} />
        )}
      </Sheet>

      <Confirm
        open={!!disabling}
        title={disabling ? `Disable device ${disabling.id}?` : ""}
        action="Disable"
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (disabling) setActive(disabling, false);
          setConfirmId(null);
        }}
      >
        {disabling ? `${disabling.name} at ${disabling.location} will be marked disabled. ` : ""}A disabled device&apos;s past punches are kept, and you can enable it again at any time.
      </Confirm>
    </div>
  );
}
