"use client";

import { Pencil, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Empty, Field, PageHeader, Panel, ReadOnlyNote, Sheet, Tag, buttonClass, useToast } from "@/components/app-ui";
import { useStore } from "@/components/store";
import { daysBetween, fmtDate } from "@/lib/time";
import type { Contractor, Deployment } from "@/lib/types";
import { assignmentOn, deploymentOf, strengthOn, scopeDate } from "@/lib/world";

// Table cells: centred vertically, with the first and last columns aligned to the panel's 16px edge.
const TABLE = "grid-table [&_td]:align-middle [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4";
const EDIT_FORM = "contractor-form";
const ADD_FORM = "add-contractor-form";

const fmtDay = (d: string) => `${fmtDate(d, false)} ${d.slice(0, 4)}`;
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);


type Terms = { contactPerson: string; phone: string; validFrom: string; validTo: string };

/** Contact and contract checks shared by add and edit. */
function checkTerms(t: Terms) {
  const e: Record<string, string> = {};
  if (t.contactPerson.trim().length < 2) e.contactPerson = "Enter a contact person.";
  else if (t.contactPerson.trim().length > 80) e.contactPerson = "Keep the name under 80 characters.";
  const digits = t.phone.replace(/\D/g, "").length;
  if (!/^\+?[\d\s-]+$/.test(t.phone.trim()) || digits < 10 || digits > 13) e.phone = "Enter a valid phone number.";
  if (!isDate(t.validFrom)) e.validFrom = "Choose the contract start date.";
  if (!isDate(t.validTo) || (isDate(t.validFrom) && t.validTo <= t.validFrom)) e.validTo = "Contract end must be after the start.";
  return e;
}

function ContractTag({ c, today }: { c: Contractor; today: string }) {
  if (c.validFrom > today) return <Tag tone="muted">Starts {fmtDay(c.validFrom)}</Tag>;
  const left = daysBetween(today, c.validTo);
  if (left < 0) return <Tag tone="alert">Contract ended</Tag>;
  if (left > 30) return null;
  return (
    <Tag tone="ink">
      <span aria-hidden className="size-1.5 rounded-full bg-warning" />
      {left === 0 ? "Ends today" : `Ends in ${left} day${left === 1 ? "" : "s"}`}
    </Tag>
  );
}

function StrengthEditor({ d }: { d: Deployment }) {
  const { world, n, dispatch } = useStore();
  const toast = useToast();
  const cur = strengthOn(d, world.today);
  const [form, setForm] = useState({ from: world.today, licensed: String(cur.licensed), approved: String(cur.approved) });
  const [err, setErr] = useState<string | null>(null);
  const [fromErr, setFromErr] = useState<string | null>(null);
  return (
    <form
      noValidate
      className="grid items-end gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        // Same rule as the store's violation(): never backdate a strength change.
        const fe = !isDate(form.from) ? "Choose the effective date." : form.from < world.today ? "A strength change takes effect today or later; past reports are never rewritten." : null;
        setFromErr(fe);
        if (fe) return setErr(null);
        const lic = Number(form.licensed);
        const app = Number(form.approved);
        if (form.licensed.trim() === "" || !Number.isInteger(lic) || lic < 0 || lic > 5000) return setErr("Licensed strength must be a whole number from 0 to 5000.");
        if (form.approved.trim() === "" || !Number.isInteger(app) || app < 0) return setErr("Approved strength must be a whole number.");
        if (app > lic) return setErr("Approved strength can't exceed the licensed strength.");
        const res = dispatch(
          { type: "strength/set", deploymentId: d.id, entry: { from: form.from, licensed: lic, approved: app } },
          `Strength for ${n.deploymentLabel(d)}: licensed ${lic}, approved ${app} from ${form.from}`,
        );
        if (!res.ok) return setErr(res.error);
        setErr(null);
        toast("Strength updated. Reports use it from the effective date.");
      }}
    >
      <Field label="Effective from" error={fromErr}>
        {(p) => <input {...p} type="date" className="field" min={world.today} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />}
      </Field>
      <Field label="Licensed">
        {(p) => <input {...p} inputMode="numeric" className="field tabular-nums" value={form.licensed} onChange={(e) => setForm({ ...form, licensed: e.target.value })} />}
      </Field>
      <Field label="Approved">
        {(p) => <input {...p} inputMode="numeric" className="field tabular-nums" value={form.approved} onChange={(e) => setForm({ ...form, approved: e.target.value })} />}
      </Field>
      <Button type="submit" kind="tape" className="justify-self-end">
        Save change
      </Button>
      {err && (
        <p role="alert" className="text-[13px] font-medium text-destructive sm:col-span-4">
          {err}
        </p>
      )}
    </form>
  );
}

function EditContractor({ c, workers, onDone }: { c: Contractor; workers: number; onDone: () => void }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({ contactPerson: c.contactPerson, phone: c.phone, validFrom: c.validFrom, validTo: c.validTo, active: c.active });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof Terms) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = checkTerms(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const next: Contractor = { ...c, contactPerson: form.contactPerson.trim(), phone: form.phone.trim().replace(/\s+/g, " "), validFrom: form.validFrom, validTo: form.validTo, active: form.active };
    const labels: Record<string, string> = { contactPerson: "contact person", phone: "phone", validFrom: "contract start", validTo: "contract end", active: "status" };
    const changed = Object.keys(labels).filter((k) => next[k as keyof Contractor] !== c[k as keyof Contractor]);
    if (!changed.length) {
      toast("No changes to save.");
      return onDone();
    }
    const res = dispatch({ type: "contractor/update", contractor: next }, `Updated contractor ${c.code} ${c.name}: ${changed.map((k) => labels[k]).join(", ")}`);
    if (!res.ok) return setErrors({ form: res.error });
    toast(`${c.name} updated.`);
    onDone();
  }

  return (
    <form id={EDIT_FORM} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact person" error={errors.contactPerson}>
          {(p) => <input {...p} className="field" maxLength={80} value={form.contactPerson} onChange={set("contactPerson")} />}
        </Field>
        <Field label="Phone" error={errors.phone} hint="e.g. +91 90000 00101">
          {(p) => <input {...p} type="tel" className="field" maxLength={20} value={form.phone} onChange={set("phone")} />}
        </Field>
        <Field label="Contract from" error={errors.validFrom}>
          {(p) => <input {...p} type="date" className="field" value={form.validFrom} onChange={set("validFrom")} />}
        </Field>
        <Field label="Contract to" error={errors.validTo}>
          {(p) => <input {...p} type="date" className="field" min={form.validFrom || undefined} value={form.validTo} onChange={set("validTo")} />}
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" className="size-4 accent-primary" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active contractor
        </label>
        <p className="text-[13px] text-muted-foreground">
          {form.active
            ? "Inactive contractors stay on record but can't take new workers or transfers."
            : workers > 0
              ? `${workers} active worker${workers === 1 ? " stays" : "s stay"} deployed. Transfer or deactivate them separately.`
              : "The contractor stays on record but can't take new workers or transfers."}
        </p>
      </div>
      {errors.form && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
          {errors.form}
        </p>
      )}
    </form>
  );
}

function AddContractor({ onDone }: { onDone: () => void }) {
  const { world, dispatch } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    code: "",
    name: "",
    contactPerson: "",
    phone: "",
    validFrom: world.today,
    validTo: "",
    departmentId: world.departments[0]?.id ?? "__new",
    newDepartment: "",
    licensed: "10",
    approved: "10",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = checkTerms(form);
    const code = form.code.trim().toUpperCase();
    const id = `c-${code.toLowerCase()}`;
    if (!/^[A-Z]{2,4}$/.test(code)) errs.code = "2–4 letters.";
    else if (world.contractors.some((c) => c.code === code || c.id === id)) errs.code = "Code already in use.";
    const name = form.name.trim().replace(/\s+/g, " ");
    if (name.length < 2) errs.name = "Enter the legal or trade name.";
    else if (world.contractors.some((c) => c.name.toLowerCase() === name.toLowerCase())) errs.name = "A contractor with this name already exists.";
    const newDept = form.departmentId === "__new";
    const deptName = form.newDepartment.trim().replace(/\s+/g, " ");
    if (newDept && deptName.length < 2) errs.newDepartment = "Name the department.";
    else if (newDept && world.departments.some((d) => d.name.toLowerCase() === deptName.toLowerCase())) errs.newDepartment = "This department exists. Choose it from the list.";
    const lic = Number(form.licensed);
    const app = Number(form.approved);
    if (form.licensed.trim() === "" || !Number.isInteger(lic) || lic < 1 || lic > 5000) errs.licensed = "Whole number from 1 to 5000.";
    if (form.approved.trim() === "" || !Number.isInteger(app) || app < 0 || app > lic) errs.approved = "0 to licensed strength.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const contractor: Contractor = {
      id,
      code,
      name,
      contactPerson: form.contactPerson.trim(),
      phone: form.phone.trim().replace(/\s+/g, " "),
      validFrom: form.validFrom,
      validTo: form.validTo,
      active: true,
    };
    const deptId = newDept ? `d-${crypto.randomUUID().slice(0, 6)}` : form.departmentId;
    const steps = [
      dispatch({ type: "contractor/create", contractor }, `Added contractor ${code} ${name}`),
      newDept ? dispatch({ type: "department/create", department: { id: deptId, name: deptName } }, `Added department ${deptName}`) : { ok: true as const },
      dispatch(
        {
          type: "deployment/create",
          deployment: { id: `dep-${code.toLowerCase()}-${deptId}`, contractorId: id, departmentId: deptId, strengths: [{ from: form.validFrom, licensed: lic, approved: app }] },
        },
        `Deployed ${code} with licensed ${lic}, approved ${app}`,
      ),
    ];
    const failed = steps.find((s) => !s.ok);
    if (failed && !failed.ok) return setErrors({ form: failed.error });
    toast(`${name} added with its first deployment.`);
    onDone();
  }

  return (
    <form id={ADD_FORM} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-4">
        <Field label="Code" error={errors.code}>
          {(p) => <input {...p} className="field font-mono" maxLength={4} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />}
        </Field>
        <Field label="Name" error={errors.name}>
          {(p) => <input {...p} className="field" maxLength={120} value={form.name} onChange={set("name")} />}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact person" error={errors.contactPerson}>
          {(p) => <input {...p} className="field" maxLength={80} value={form.contactPerson} onChange={set("contactPerson")} />}
        </Field>
        <Field label="Phone" error={errors.phone}>
          {(p) => <input {...p} type="tel" className="field" maxLength={20} value={form.phone} onChange={set("phone")} />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Contract from" error={errors.validFrom}>
          {(p) => <input {...p} type="date" className="field" value={form.validFrom} onChange={set("validFrom")} />}
        </Field>
        <Field label="Contract to" error={errors.validTo}>
          {(p) => <input {...p} type="date" className="field" min={form.validFrom || undefined} value={form.validTo} onChange={set("validTo")} />}
        </Field>
      </div>
      <Field label="First department">
        {(p) => (
          <select {...p} className="field" value={form.departmentId} onChange={set("departmentId")}>
            {world.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            <option value="__new">New department…</option>
          </select>
        )}
      </Field>
      {form.departmentId === "__new" && (
        <Field label="New department name" error={errors.newDepartment}>
          {(p) => <input {...p} className="field" maxLength={60} value={form.newDepartment} onChange={set("newDepartment")} />}
        </Field>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Licensed strength" error={errors.licensed}>
          {(p) => <input {...p} inputMode="numeric" className="field tabular-nums" value={form.licensed} onChange={set("licensed")} />}
        </Field>
        <Field label="Approved strength" error={errors.approved}>
          {(p) => <input {...p} inputMode="numeric" className="field tabular-nums" value={form.approved} onChange={set("approved")} />}
        </Field>
      </div>
      {errors.form && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
          {errors.form}
        </p>
      )}
    </form>
  );
}

export function ContractorsView() {
  const { world, n, viewer, can } = useStore();
  const [adding, setAdding] = useState(false);
  const [strengthFor, setStrengthFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const manage = can("manageMasters");
  const contractors = world.contractors.filter((c) => viewer.role !== "CONTRACTOR_ADMIN" || c.id === viewer.contractorId);

  // Active workers per deployment (deployed today) and per contractor (as the Workers page counts them).
  const counts = useMemo(() => {
    const byDeployment = new Map<string, number>();
    const byContractor = new Map<string, number>();
    for (const w of world.workers) {
      if (!w.active) continue;
      const d = deploymentOf(world, w, world.today);
      if (d) byDeployment.set(d.id, (byDeployment.get(d.id) ?? 0) + 1);
      const c = assignmentOn(w, scopeDate(w, world.today))?.contractorId;
      if (c) byContractor.set(c, (byContractor.get(c) ?? 0) + 1);
    }
    return { byDeployment, byContractor };
  }, [world]);

  const editing = contractors.find((c) => c.id === editingId);
  const year = world.today.slice(0, 4);

  return (
    <div>
      <PageHeader
        title="Contractors"
        description={`${contractors.length} contractor${contractors.length === 1 ? "" : "s"}. Strength changes are effective-dated, so history is never overwritten.`}
        actions={
          manage && (
            <Button kind="tape" onClick={() => setAdding(true)}>
              <Plus aria-hidden /> Add contractor
            </Button>
          )
        }
      />
      {!manage && (
        <div className="mb-4">
          <ReadOnlyNote>Licensed and approved strengths are maintained by the client admin.</ReadOnlyNote>
        </div>
      )}

      {contractors.length === 0 ? (
        <Empty title="No contractors yet">{manage ? "Add a contractor with its first deployment to start." : "Contractors appear here once the client admin adds them."}</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {contractors.map((c) => {
            const deps = world.deployments.filter((d) => d.contractorId === c.id);
            const open = deps.find((d) => d.id === strengthFor);
            const total = counts.byContractor.get(c.id) ?? 0;
            return (
              <Panel key={c.id} className="slot-in overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b p-4">
                  <div className="min-w-0 flex-1 basis-64">
                    <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight">
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] font-medium text-muted-foreground">{c.code}</span>
                      <span className="min-w-0 break-words">{c.name}</span>
                    </h2>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {c.contactPerson} · <span className="tabular-nums whitespace-nowrap">{c.phone}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                      <span className="tabular-nums">
                        Contract {fmtDay(c.validFrom)} – {fmtDay(c.validTo)}
                      </span>
                      {c.active ? <Tag tone="ok">Active</Tag> : <Tag tone="muted">Inactive</Tag>}
                      <ContractTag c={c} today={world.today} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/workers?contractor=${encodeURIComponent(c.id)}`} className={buttonClass("plain", "sm")}>
                      <Users aria-hidden /> {total} worker{total === 1 ? "" : "s"}
                    </Link>
                    {manage && (
                      <Button size="sm" onClick={() => setEditingId(c.id)} aria-label={`Edit details of ${c.name}`}>
                        <Pencil aria-hidden /> Edit details
                      </Button>
                    )}
                  </div>
                </div>

                {deps.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No deployments yet.</p>
                ) : (
                  <div className="relative overflow-x-auto">
                    <table className={TABLE}>
                      <thead>
                        <tr>
                          <th>Department</th>
                          <th className="num">Licensed</th>
                          <th className="num">Approved</th>
                          <th className="num">Current workers</th>
                          <th>Strength history (licensed/approved)</th>
                          {manage && (
                            <th>
                              <span className="sr-only">Change</span>
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {deps.map((d) => {
                          const s = strengthOn(d, world.today);
                          const count = counts.byDeployment.get(d.id) ?? 0;
                          const label = n.deploymentLabel(d);
                          return (
                            <tr key={d.id}>
                              <td className="font-medium whitespace-nowrap">{n.department.get(d.departmentId)?.name}</td>
                              <td className="num">{s.licensed}</td>
                              <td className="num">{s.approved}</td>
                              {/* ponytail: headcount includes relievers by design, so no over-strength flag here; the dashboard compares present vs approved. */}
                              <td className="num">{count}</td>
                              <td className="text-[13px] text-muted-foreground tabular-nums">
                                {[...d.strengths]
                                  .sort((a, b) => b.from.localeCompare(a.from))
                                  .map((x) => `${x.from.slice(0, 4) === year ? fmtDate(x.from, false) : fmtDay(x.from)}: ${x.licensed}/${x.approved}`)
                                  .join(" · ")}
                              </td>
                              {manage && (
                                <td className="text-right">
                                  <Button
                                    size="sm"
                                    onClick={() => setStrengthFor(strengthFor === d.id ? null : d.id)}
                                    aria-expanded={strengthFor === d.id}
                                    aria-label={`${strengthFor === d.id ? "Close strength editor for" : "Change strength for"} ${label}`}
                                  >
                                    {strengthFor === d.id ? "Close" : "Change"}
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {open && manage && (
                  <div className="border-t bg-muted/40 p-4">
                    <h3 className="mb-3 text-sm font-semibold">New strength for {n.deploymentLabel(open)}</h3>
                    <StrengthEditor key={open.id} d={open} />
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add contractor"
        description="Creates the contractor with its first deployment and strength."
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button kind="tape" type="submit" form={ADD_FORM}>
              Add contractor
            </Button>
          </>
        }
      >
        {adding && <AddContractor onDone={() => setAdding(false)} />}
      </Sheet>
      <Sheet
        open={!!editing && manage}
        onClose={() => setEditingId(null)}
        title={editing ? `Edit ${editing.name}` : ""}
        description="Contact, contract dates and status. The code and name stay as they are."
        footer={
          <>
            <Button onClick={() => setEditingId(null)}>Cancel</Button>
            <Button kind="tape" type="submit" form={EDIT_FORM}>
              Save changes
            </Button>
          </>
        }
      >
        {editing && <EditContractor key={editing.id} c={editing} workers={counts.byContractor.get(editing.id) ?? 0} onDone={() => setEditingId(null)} />}
      </Sheet>
    </div>
  );
}
