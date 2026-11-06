"use client";

import { Pencil, Plus, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { SegmentedControl } from "@/components/21st";
import { Button, Empty, Field, PageHeader, Panel, ReadOnlyNote, Sheet, Tag, useToast } from "@/components/app-ui";
import { StatusIcon, statusOf } from "@/components/status";
import { useStore } from "@/components/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useHashId } from "@/components/use-hash";
import type { WorkerProfile } from "@/lib/actions";
import { addDays, fmtDT, fmtDate } from "@/lib/time";
import { ID_PROOFS, SKILLS, type IdProof, type Skill, type Viewer, type Worker, type World } from "@/lib/types";
import { assignmentOn, canSeeDeployment, canSeeWorker, deploymentOf, scopeDate } from "@/lib/world";

const PAGE = 200;
const FORM_ID = "worker-form";
const PENDING = "PENDING-";

const SKILL_LABEL: Record<Skill, string> = {
  UNSKILLED: "Unskilled",
  SEMI_SKILLED: "Semi-skilled",
  SKILLED: "Skilled",
  HIGHLY_SKILLED: "Highly skilled",
};
const ID_LABEL: Record<IdProof, string> = { AADHAAR: "Aadhaar", VOTER_ID: "Voter ID", DRIVING_LICENCE: "Driving licence", PAN: "PAN" };
const GENDER_LABEL = { MALE: "Male", FEMALE: "Female", OTHER: "Other" } as const;
type Gender = keyof typeof GENDER_LABEL;

const STATUS_OPTIONS: { value: "active" | "inactive" | "all"; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "All" },
];

// Table cells: centred vertically, with the first and last columns aligned to the panel's 16px edge.
const TABLE = "grid-table [&_td]:align-middle [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4";

const fmtDay = (d: string) => `${fmtDate(d, false)} ${d.slice(0, 4)}`;
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const pending = (w: Worker) => w.deviceId.startsWith(PENDING);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();


/** Indian mobile: 10 digits starting 6-9, with or without +91. Returns "+91 XXXXXXXXXX", or null when invalid. */
function parseMobile(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, "").replace(/^\+?91(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91 ${digits}` : null;
}

/** Next free 4-digit number after the contractor's code, e.g. MAY-0030. */
function proposeCode(world: World, contractorCode: string) {
  const prefix = `${contractorCode}-`;
  let max = 0;
  for (const w of world.workers) {
    if (!w.id.startsWith(prefix)) continue;
    const n = Number(w.id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function ageOn(dob: string, date: string) {
  return Number(date.slice(0, 4)) - Number(dob.slice(0, 4)) - (date.slice(5) < dob.slice(5) ? 1 : 0);
}

/** Deployments the viewer may put workers into: their own, of active contractors. */
function useDeploymentOptions() {
  const { world, n, viewer } = useStore();
  return useMemo(
    () =>
      world.deployments
        .filter((d) => canSeeDeployment(viewer, d) && n.contractor.get(d.contractorId)?.active !== false)
        .map((d) => ({ d, label: n.deploymentLabel(d) })),
    [world.deployments, n, viewer],
  );
}

/* ---------- Worker form: add and edit share fields and validation ---------- */

type Form = {
  deploymentId: string;
  /** null while the proposed code is used, so it follows deployment changes until the user types their own. */
  code: string | null;
  designation: string;
  skill: Skill | "";
  joinedOn: string;
  name: string;
  fatherName: string;
  gender: Gender | "";
  dateOfBirth: string;
  mobile: string;
  deviceId: string;
  enrolLater: boolean;
  uan: string;
  esicNo: string;
  idType: IdProof | "";
  idLast4: string;
  emergencyContact: string;
  address: string;
};

const blankForm = (deploymentId: string, today: string): Form => ({
  deploymentId,
  code: null,
  designation: "",
  skill: "",
  joinedOn: today,
  name: "",
  fatherName: "",
  gender: "",
  dateOfBirth: "",
  mobile: "",
  deviceId: "",
  enrolLater: false,
  uan: "",
  esicNo: "",
  idType: "",
  idLast4: "",
  emergencyContact: "",
  address: "",
});

const formOf = (w: Worker): Form => ({
  deploymentId: "",
  code: w.id,
  designation: w.designation,
  skill: w.skill ?? "",
  joinedOn: w.joinedOn ?? "",
  name: w.name,
  fatherName: w.fatherName ?? "",
  gender: w.gender ?? "",
  dateOfBirth: w.dateOfBirth ?? "",
  mobile: w.mobile ?? "",
  deviceId: pending(w) ? "" : w.deviceId,
  enrolLater: pending(w),
  uan: w.uan ?? "",
  esicNo: w.esicNo ?? "",
  idType: w.idProof?.type ?? "",
  idLast4: w.idProof?.last4 ?? "",
  emergencyContact: w.emergencyContact ?? "",
  address: w.address ?? "",
});

const FIELD_LABEL: Record<keyof WorkerProfile, string> = {
  name: "name",
  designation: "designation",
  deviceId: "device ID",
  fatherName: "father's name",
  gender: "gender",
  dateOfBirth: "date of birth",
  mobile: "mobile",
  skill: "skill",
  joinedOn: "joining date",
  uan: "UAN",
  esicNo: "ESIC number",
  idProof: "ID proof",
  emergencyContact: "emergency contact",
  address: "address",
};

const NAME_RE = /^[\p{L}][\p{L}\p{M} .'-]*$/u;

/** Validates the form. `self` is the worker being edited (null when adding); `code` the employee code. */
function validate(f: Form, code: string, self: Worker | null, world: World, viewer: Viewer) {
  const e: Record<string, string> = {};
  // Who already holds a unique value. A contractor admin is not told the name of another contractor's worker.
  const holder = (match: (w: Worker) => boolean) => {
    const o = world.workers.find((w) => w.id !== self?.id && match(w));
    if (!o) return null;
    return canSeeWorker(viewer, o, scopeDate(o, world.today)) ? `${o.name} (${o.id})` : "a worker of another contractor";
  };
  const person = (v: string, key: string, empty: string) => {
    const t = v.trim().replace(/\s+/g, " ");
    if (t.length < 2) e[key] = empty;
    else if (t.length > 80) e[key] = "Keep it under 80 characters.";
    else if (!NAME_RE.test(t)) e[key] = "Use letters, spaces, dots, apostrophes and hyphens only.";
    return t;
  };

  if (!self) {
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) e.code = "Use 3–20 capital letters, digits or hyphens.";
    else {
      const who = holder((w) => w.id.toUpperCase() === code);
      if (who) e.code = `${code} is already used by ${who}.`;
    }
  }

  const designation = f.designation.trim().replace(/\s+/g, " ");
  if (designation.length < 2) e.designation = "Enter a designation.";
  else if (designation.length > 60) e.designation = "Keep the designation under 60 characters.";
  if (!f.skill) e.skill = "Choose a skill category.";

  const latest = addDays(world.today, 30);
  if (!isDate(f.joinedOn)) e.joinedOn = "Choose the joining date.";
  else if (f.joinedOn > latest) e.joinedOn = `The joining date can be at most 30 days ahead (${fmtDay(latest)}).`;
  else if (self) {
    const first = self.assignments.reduce((m, a) => (a.from < m ? a.from : m), self.assignments[0]?.from ?? f.joinedOn);
    if (f.joinedOn > first) e.joinedOn = `Deployed since ${fmtDay(first)}, so the joining date can't be later than that.`;
  }

  const name = person(f.name, "name", "Enter the worker's full name.");
  const fatherName = person(f.fatherName, "fatherName", "Enter the father's or guardian's name.");
  if (!f.gender) e.gender = "Choose a gender.";

  if (!isDate(f.dateOfBirth)) e.dateOfBirth = "Enter the date of birth.";
  else if (f.dateOfBirth >= world.today) e.dateOfBirth = "The date of birth must be in the past.";
  else if (isDate(f.joinedOn)) {
    const age = ageOn(f.dateOfBirth, f.joinedOn);
    if (age < 18) e.dateOfBirth = `The worker must be at least 18 on the joining date (${fmtDay(f.joinedOn)}).`;
    else if (age > 75) e.dateOfBirth = "Check the date of birth: the worker would be over 75 on joining.";
  }

  const mobile = parseMobile(f.mobile);
  if (!f.mobile.trim()) e.mobile = "Enter the mobile number.";
  else if (!mobile) e.mobile = "Enter a 10-digit Indian mobile number, e.g. 98765 43210.";

  let deviceId = `${PENDING}${self?.id ?? code}`;
  if (!f.enrolLater) {
    deviceId = f.deviceId.trim().toUpperCase();
    if (!deviceId) e.deviceId = "Enter the device ID, or tick “Enrol on device later”.";
    else if (!/^[A-Z0-9]{1,20}$/.test(deviceId)) e.deviceId = "Use 1–20 letters or digits, with no spaces or symbols.";
    else {
      const who = holder((w) => w.deviceId.toUpperCase() === deviceId);
      if (who) e.deviceId = `Device ID ${deviceId} is already used by ${who}.`;
    }
  }

  const uan = f.uan.replace(/\s/g, "");
  if (uan && !/^\d{12}$/.test(uan)) e.uan = "The UAN is 12 digits.";
  else if (uan) {
    const who = holder((w) => w.uan === uan);
    if (who) e.uan = `This UAN already belongs to ${who}.`;
  }
  const esicNo = f.esicNo.replace(/\s/g, "");
  if (esicNo && !/^(\d{10}|\d{17})$/.test(esicNo)) e.esicNo = "The ESIC number is 10 or 17 digits.";
  else if (esicNo) {
    const who = holder((w) => w.esicNo === esicNo);
    if (who) e.esicNo = `This ESIC number already belongs to ${who}.`;
  }

  const last4 = f.idLast4.trim().toUpperCase();
  if (f.idType || last4) {
    if (!f.idType) e.idType = "Choose the ID proof type.";
    if (!last4) e.idLast4 = "Enter the last 4 characters.";
    else if (f.idType === "AADHAAR" ? !/^\d{4}$/.test(last4) : !/^[A-Z0-9]{4}$/.test(last4))
      e.idLast4 = f.idType === "AADHAAR" ? "Enter the last 4 digits of the Aadhaar number." : "Enter exactly 4 letters or digits.";
  }

  const emergency = f.emergencyContact.trim() ? parseMobile(f.emergencyContact) : "";
  if (emergency === null) e.emergencyContact = "Enter a 10-digit mobile number, or leave it blank.";
  else if (emergency && emergency === mobile) e.emergencyContact = "Use a relative's or friend's number, not the worker's own.";

  const address = f.address.trim();
  if (address.length > 300) e.address = "Keep the address under 300 characters.";

  // Optional fields left blank are simply absent; when editing, the patch turns a cleared field into null (removed).
  const opt = (v: string) => v || undefined;
  const profile: Partial<Omit<Worker, "id" | "assignments" | "active">> & { deviceId: string; name: string; designation: string } = {
    name,
    designation,
    deviceId,
    fatherName,
    gender: f.gender || undefined,
    dateOfBirth: f.dateOfBirth,
    mobile: mobile ?? undefined,
    skill: f.skill || undefined,
    joinedOn: f.joinedOn,
    uan: opt(uan),
    esicNo: opt(esicNo),
    idProof: f.idType && last4 ? { type: f.idType, last4 } : undefined,
    emergencyContact: opt(emergency ?? ""),
    address: opt(address),
  };
  return { errors: e, profile };
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b pb-6 last:border-b-0 last:pb-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Add (no `worker`) or edit details of an existing worker. Submit buttons live in the sheet footer (form={FORM_ID}). */
function WorkerForm({ worker, onDone }: { worker?: Worker; onDone: (id: string) => void }) {
  const { world, n, viewer, dispatch } = useStore();
  const toast = useToast();
  const options = useDeploymentOptions();
  const formRef = useRef<HTMLFormElement>(null);
  const [f, setF] = useState<Form>(() => (worker ? formOf(worker) : blankForm(options[0]?.d.id ?? "", world.today)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const text = (k: { [K in keyof Form]: Form[K] extends string ? K : never }[keyof Form]) => ({
    value: f[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k, e.target.value as never),
  });

  const dep = options.find((o) => o.d.id === f.deploymentId)?.d;
  const proposed = useMemo(() => (dep ? proposeCode(world, n.contractor.get(dep.contractorId)?.code ?? "W") : ""), [world, n, dep]);
  const code = worker ? worker.id : (f.code ?? proposed);
  const current = worker ? deploymentOf(world, worker, scopeDate(worker, world.today)) : undefined;

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const { errors: errs, profile } = validate(f, code, worker ?? null, world, viewer);
    if (!worker && !dep) errs.deploymentId = "Choose where the worker is deployed.";
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    if (!worker) {
      const created: Worker = {
        ...profile,
        id: code,
        active: true,
        assignments: [{ from: f.joinedOn, contractorId: dep!.contractorId, departmentId: dep!.departmentId }],
      };
      const res = dispatch({ type: "worker/create", worker: created }, `Added worker ${code} ${created.name} to ${n.deploymentLabel(dep!)} from ${f.joinedOn}`);
      if (!res.ok) return setFormError(res.error);
      toast(f.enrolLater ? `${code} added. Enrol the face on the device, then roster the worker.` : `${code} added. Roster the worker to start attendance.`);
      return onDone(code);
    }

    const keys = (Object.keys(profile) as (keyof WorkerProfile)[]).filter((k) => JSON.stringify(profile[k] ?? "") !== JSON.stringify(worker[k] ?? ""));
    if (!keys.length) {
      toast("No changes to save.");
      return onDone(worker.id);
    }
    // A cleared field is sent as null so the reducer removes it (undefined would vanish from the saved log).
    const patch: WorkerProfile = Object.fromEntries(keys.map((k) => [k, profile[k] ?? null]));
    const res = dispatch({ type: "worker/update", workerId: worker.id, patch }, `Updated ${worker.id} ${worker.name}: ${keys.map((k) => FIELD_LABEL[k]).join(", ")}`);
    if (!res.ok) return setFormError(res.error);
    toast(`${worker.id} updated.`);
    onDone(worker.id);
  }

  if (!worker && options.length === 0) {
    return <Empty title="No deployments to add workers to">A worker joins a contractor&apos;s department. Ask the client admin to set up an active deployment first.</Empty>;
  }

  return (
    <form id={FORM_ID} ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
      {formError && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
          {formError}
        </p>
      )}

      <Section title="Employment">
        {worker ? (
          <Field label="Deployment" hint="Change it with Transfer, so the history is kept.">
            {(p) => <input {...p} className="field" disabled value={current ? n.deploymentLabel(current) : "—"} />}
          </Field>
        ) : (
          <Field label="Deployment" error={errors.deploymentId}>
            {(p) => (
              <select {...p} className="field" {...text("deploymentId")}>
                {options.map((o) => (
                  <option key={o.d.id} value={o.d.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Field
              label="Employee code"
              error={errors.code}
              hint={worker ? "Fixed once the worker is created." : f.code === null ? "Suggested from the contractor code. You can change it before saving." : undefined}
            >
              {(p) => (
                <input
                  {...p}
                  className="field font-mono"
                  disabled={!!worker}
                  value={code}
                  maxLength={20}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                />
              )}
            </Field>
            {!worker && f.code !== null && f.code !== proposed && proposed && (
              <Button kind="quiet" className="h-auto self-start text-[13px]" onClick={() => set("code", null)}>
                Use suggested code {proposed}
              </Button>
            )}
          </div>
          <Field label="Joining date" error={errors.joinedOn} hint={worker ? undefined : "The first deployment starts on this date."}>
            {(p) => <input {...p} type="date" className="field" max={addDays(world.today, 30)} {...text("joinedOn")} />}
          </Field>
          <Field label="Designation" error={errors.designation}>
            {(p) => <input {...p} className="field" maxLength={60} placeholder="Loader" autoFocus={!!worker} {...text("designation")} />}
          </Field>
          <Field label="Skill category" error={errors.skill}>
            {(p) => (
              <select {...p} className="field" {...text("skill")}>
                <option value="">Choose…</option>
                {SKILLS.map((s) => (
                  <option key={s} value={s}>
                    {SKILL_LABEL[s]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Section>

      <Section title="Personal">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={errors.name}>
            {(p) => <input {...p} className="field" maxLength={80} autoComplete="off" {...text("name")} />}
          </Field>
          <Field label="Father's or guardian's name" error={errors.fatherName}>
            {(p) => <input {...p} className="field" maxLength={80} autoComplete="off" {...text("fatherName")} />}
          </Field>
          <Field label="Gender" error={errors.gender}>
            {(p) => (
              <select {...p} className="field" {...text("gender")}>
                <option value="">Choose…</option>
                {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
                  <option key={g} value={g}>
                    {GENDER_LABEL[g]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Date of birth" error={errors.dateOfBirth} hint="Must be 18 or older on the joining date.">
            {(p) => <input {...p} type="date" className="field" max={world.today} {...text("dateOfBirth")} />}
          </Field>
          <Field label="Mobile" error={errors.mobile} hint="10 digits. +91 is added for you.">
            {(p) => <input {...p} type="tel" inputMode="tel" className="field" autoComplete="off" placeholder="98765 43210" {...text("mobile")} />}
          </Field>
        </div>
      </Section>

      <Section
        title="Attendance device"
        description="Workers already enrolled on the face device keep their existing number, so their punches map to them."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Device ID" error={errors.deviceId} hint="The worker's enrolment number on the attendance devices.">
            {(p) => (
              <input
                {...p}
                className="field font-mono"
                maxLength={20}
                autoComplete="off"
                spellCheck={false}
                disabled={f.enrolLater}
                placeholder={f.enrolLater ? "Not enrolled yet" : "10234"}
                value={f.enrolLater ? "" : f.deviceId}
                onChange={(e) => set("deviceId", e.target.value.toUpperCase())}
              />
            )}
          </Field>
          <label className="flex items-center gap-2 self-start text-[14px] sm:mt-[30px]">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={f.enrolLater}
              onChange={(e) => {
                set("enrolLater", e.target.checked);
                setErrors((p) => ({ ...p, deviceId: "" }));
              }}
            />
            Enrol on device later
          </label>
        </div>
      </Section>

      <Section title="Statutory (optional)" description="Only the type and last 4 characters of the ID proof are kept. Full ID numbers are never stored.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="UAN" error={errors.uan} hint="12 digits.">
            {(p) => <input {...p} inputMode="numeric" className="field tabular-nums" maxLength={14} autoComplete="off" {...text("uan")} />}
          </Field>
          <Field label="ESIC number" error={errors.esicNo} hint="10 or 17 digits.">
            {(p) => <input {...p} inputMode="numeric" className="field tabular-nums" maxLength={19} autoComplete="off" {...text("esicNo")} />}
          </Field>
          <Field label="ID proof type" error={errors.idType}>
            {(p) => (
              <select {...p} className="field" {...text("idType")}>
                <option value="">None</option>
                {ID_PROOFS.map((t) => (
                  <option key={t} value={t}>
                    {ID_LABEL[t]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="ID proof, last 4 characters" error={errors.idLast4}>
            {(p) => (
              <input
                {...p}
                className="field font-mono"
                maxLength={4}
                autoComplete="off"
                spellCheck={false}
                value={f.idLast4}
                onChange={(e) => set("idLast4", e.target.value.toUpperCase())}
              />
            )}
          </Field>
        </div>
      </Section>

      <Section title="Contact (optional)">
        <Field label="Emergency contact" error={errors.emergencyContact} hint="A relative's or friend's mobile.">
          {(p) => <input {...p} type="tel" inputMode="tel" className="field sm:max-w-[calc(50%-8px)]" autoComplete="off" placeholder="98765 43210" {...text("emergencyContact")} />}
        </Field>
        <Field label="Address" error={errors.address}>
          {(p) => <textarea {...p} rows={3} maxLength={300} className="field resize-y" {...text("address")} />}
        </Field>
      </Section>
    </form>
  );
}

/* ---------- Worker sheet ---------- */

function Facts({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <dl className="grid gap-x-6 gap-y-3 rounded-lg border px-4 py-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium break-words">{children || <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function WorkerDetail({ w, onEdit }: { w: Worker; onEdit: () => void }) {
  const { world, idx, n, viewer, can, dispatch } = useStore();
  const toast = useToast();
  const options = useDeploymentOptions();
  const on = scopeDate(w, world.today);
  const current = assignmentOn(w, on);
  const first = w.assignments.reduce((m, a) => (a.from < m ? a.from : m), on);
  const [to, setTo] = useState("");
  const [from, setFrom] = useState(world.today);
  const [err, setErr] = useState<string | null>(null);
  const recent = (idx.byWorker.get(w.id) ?? []).filter((s) => s.assignment.date <= world.today).slice(-7).reverse();
  const history = [...w.assignments].sort((a, b) => b.from.localeCompare(a.from));

  function transfer() {
    const dep = options.find((o) => o.d.id === to)?.d;
    if (!dep) return setErr("Choose the new deployment.");
    if (current && dep.contractorId === current.contractorId && dep.departmentId === current.departmentId) return setErr("That is the current deployment.");
    if (!isDate(from) || from < world.today) return setErr("A transfer takes effect today or later; history is never rewritten.");
    if (from <= first) return setErr(`The worker joins on ${fmtDay(first)}; a transfer must take effect after that.`);
    if (w.assignments.some((a) => a.from === from)) return setErr("There is already a change on that date.");
    const res = dispatch(
      { type: "worker/transfer", workerId: w.id, period: { from, contractorId: dep.contractorId, departmentId: dep.departmentId } },
      `Transferred ${w.id} to ${n.deploymentLabel(dep)} from ${from}`,
    );
    if (!res.ok) return setErr(res.error);
    setErr(null);
    setTo("");
    toast("Transfer recorded. Earlier assignments are kept.");
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-start gap-3">
        <Avatar size="lg">
          <AvatarFallback className="bg-accent font-medium text-accent-foreground">{initials(w.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold tracking-tight">{w.name}</p>
            {w.active ? <Tag tone="ok">Active</Tag> : <Tag tone="muted">Inactive</Tag>}
            {on > world.today && <Tag tone="day">Joins {fmtDay(on)}</Tag>}
          </div>
          <p className="text-muted-foreground">
            {w.designation}
            {w.skill && ` · ${SKILL_LABEL[w.skill]}`}
          </p>
        </div>
        {can("manageWorkers") && (
          <Button size="sm" onClick={onEdit}>
            <Pencil aria-hidden /> Edit details
          </Button>
        )}
      </section>

      <Facts title="Employment">
        <Fact label="Employee code">
          <span className="font-mono">{w.id}</span>
        </Fact>
        <Fact label="Device ID">{pending(w) ? <Tag tone="muted">Not enrolled yet</Tag> : <span className="font-mono">{w.deviceId}</span>}</Fact>
        <Fact label="Deployment">{current && `${n.contractor.get(current.contractorId)?.name ?? "?"} · ${n.department.get(current.departmentId)?.name ?? "?"}`}</Fact>
        <Fact label="Joined">{w.joinedOn && fmtDay(w.joinedOn)}</Fact>
      </Facts>

      <Facts title="Personal">
        <Fact label="Father's or guardian's name">{w.fatherName}</Fact>
        <Fact label="Gender">{w.gender && GENDER_LABEL[w.gender]}</Fact>
        <Fact label="Date of birth">{w.dateOfBirth && `${fmtDay(w.dateOfBirth)} (age ${ageOn(w.dateOfBirth, world.today)})`}</Fact>
        <Fact label="Mobile">{w.mobile}</Fact>
        <Fact label="Emergency contact">{w.emergencyContact}</Fact>
        <Fact label="Address" wide>
          {w.address && <span className="whitespace-pre-line">{w.address}</span>}
        </Fact>
      </Facts>

      <Facts title="Statutory">
        <Fact label="UAN">{w.uan && <span className="tabular-nums">{w.uan}</span>}</Fact>
        <Fact label="ESIC number">{w.esicNo && <span className="tabular-nums">{w.esicNo}</span>}</Fact>
        <Fact label="ID proof">{w.idProof && `${ID_LABEL[w.idProof.type]} •••• ${w.idProof.last4}`}</Fact>
      </Facts>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Assignment history</h3>
        <ol className="divide-y rounded-lg border text-[14px]">
          {history.map((a) => (
            <li key={a.from} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{n.contractor.get(a.contractorId)?.name}</span>
                <span className="text-muted-foreground">{n.department.get(a.departmentId)?.name}</span>
                {a === current && on === world.today && <Tag tone="day">Current</Tag>}
                {a.from > world.today && <Tag tone="ink">Scheduled</Tag>}
              </span>
              <span className="text-[13px] text-muted-foreground tabular-nums">From {fmtDate(a.from)} {a.from.slice(0, 4)}</span>
            </li>
          ))}
        </ol>
      </section>

      {can("manageWorkers") && (
        <>
          <section className="flex flex-col gap-4 rounded-xl border bg-muted/40 p-4">
            <div>
              <h3 className="text-sm font-semibold">Transfer</h3>
              <p className="text-[13px] text-muted-foreground">Takes effect today or later. Earlier assignments are kept.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New deployment" error={err}>
                {(p) => (
                  <select {...p} className="field" value={to} onChange={(e) => setTo(e.target.value)}>
                    <option value="">Choose…</option>
                    {options.map((o) => (
                      <option key={o.d.id} value={o.d.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Effective from">
                {(p) => <input {...p} type="date" className="field" min={world.today} value={from} onChange={(e) => setFrom(e.target.value)} />}
              </Field>
            </div>
            <div className="flex justify-end">
              <Button kind="tape" onClick={transfer}>
                Record transfer
              </Button>
            </div>
            {viewer.role === "CONTRACTOR_ADMIN" && <p className="text-[13px] text-muted-foreground">Contractors can move workers only within their own deployments.</p>}
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{w.active ? "Deactivate worker" : "Reactivate worker"}</h3>
              <p className="text-[13px] text-muted-foreground">{w.active ? "Attendance and history stay on record." : "The worker can be rostered again."}</p>
            </div>
            <Button
              kind={w.active ? "danger" : "plain"}
              onClick={() => {
                const res = dispatch({ type: "worker/active", workerId: w.id, active: !w.active }, `${w.active ? "Deactivated" : "Reactivated"} ${w.id} ${w.name}`);
                toast(res.ok ? (w.active ? "Worker deactivated. Their records stay." : "Worker reactivated.") : res.error, res.ok ? "ok" : "alert");
              }}
            >
              {w.active ? "Deactivate" : "Reactivate"}
            </Button>
          </section>
        </>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Last 7 shifts</h3>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">No shifts yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-[14px]">
            {recent.map((s) => (
              <li key={s.assignment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="w-24 tabular-nums">{fmtDate(s.assignment.date)}</span>
                <Tag tone={s.shift.code === "N" ? "night" : s.shift.code === "D" ? "day" : "muted"} className="w-7 justify-center font-mono">
                  {s.shift.code}
                </Tag>
                <StatusIcon status={statusOf(s)} label />
                {s.in && (
                  <span className="ml-auto text-[13px] text-muted-foreground tabular-nums">
                    {fmtDT(s.in)} → {s.out ? fmtDT(s.out) : "…"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------- Page ---------- */

export function WorkersView() {
  // useSearchParams needs a Suspense boundary; the page itself is owned elsewhere.
  return (
    <Suspense>
      <Workers />
    </Suspense>
  );
}

function Workers() {
  const params = useSearchParams();
  const { world, n, viewer, can } = useStore();
  const [query, setQuery] = useState("");
  const [depId, setDepId] = useState("");
  const [skill, setSkill] = useState<Skill | "">("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useHashId();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canAdd = useDeploymentOptions().length > 0;

  // ?contractor=<id> preselects the contractor. Pages are kept alive between visits, so follow later changes too.
  const param = params.get("contractor") ?? "";
  const [seenParam, setSeenParam] = useState(param);
  const [contractorId, setContractorId] = useState(param);
  if (param !== seenParam) {
    setSeenParam(param);
    setContractorId(param);
    setDepId("");
    setLimit(PAGE);
  }

  const contractors = useMemo(() => world.contractors.filter((c) => viewer.role !== "CONTRACTOR_ADMIN" || c.id === viewer.contractorId), [world.contractors, viewer]);
  const cFilter = contractors.some((c) => c.id === contractorId) ? contractorId : "";
  const deployments = useMemo(
    () => world.deployments.filter((d) => canSeeDeployment(viewer, d) && (!cFilter || d.contractorId === cFilter)).map((d) => ({ d, label: n.deploymentLabel(d) })),
    [world.deployments, viewer, cFilter, n],
  );
  const dFilter = deployments.some((o) => o.d.id === depId) ? depId : "";

  const visible = useMemo(() => world.workers.filter((w) => canSeeWorker(viewer, w, scopeDate(w, world.today))), [world.workers, world.today, viewer]);
  const activeCount = useMemo(() => visible.filter((w) => w.active).length, [visible]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const phone = /^[\d\s+()-]{3,}$/.test(q) ? q.replace(/\D/g, "") : "";
    return visible.flatMap((w) => {
      if (status !== "all" && w.active !== (status === "active")) return [];
      if (skill && w.skill !== skill) return [];
      const on = scopeDate(w, world.today);
      const a = assignmentOn(w, on);
      if (cFilter && a?.contractorId !== cFilter) return [];
      if (dFilter && deploymentOf(world, w, on)?.id !== dFilter) return [];
      if (
        q &&
        !w.id.toLowerCase().includes(q) &&
        !w.name.toLowerCase().includes(q) &&
        !w.deviceId.toLowerCase().includes(q) &&
        !(phone && w.mobile?.replace(/\D/g, "").includes(phone))
      )
        return [];
      return [{ w, a, joins: on > world.today ? on : null }];
    });
  }, [visible, world, query, status, skill, cFilter, dFilter]);

  // Same scope as the table, so a hash link cannot open another contractor's worker.
  const open = openId ? visible.find((w) => w.id === openId) : undefined;
  const editing = !!open && editingId === open.id;
  const filtered = !!(query || cFilter || dFilter || skill || status !== "active");
  const resetPage = () => setLimit(PAGE);

  return (
    <div>
      <PageHeader
        title="Workers"
        description={`${activeCount} active worker${activeCount === 1 ? "" : "s"}. The employee code and device ID link each worker to their punches.`}
        actions={
          can("manageWorkers") && (
            <Button kind="tape" onClick={() => setAdding(true)}>
              <Plus aria-hidden /> Add worker
            </Button>
          )
        }
      />
      {!can("manageWorkers") && (
        <div className="mb-4">
          <ReadOnlyNote>Workers are added and updated by the client admin and their contractor.</ReadOnlyNote>
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative min-w-0 lg:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              aria-label="Search workers"
              className="field pl-9"
              placeholder="Code, name, device ID or mobile"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:contents">
            {contractors.length > 1 && (
              <select
                aria-label="Contractor"
                className="field lg:w-48"
                value={cFilter}
                onChange={(e) => {
                  setContractorId(e.target.value);
                  setDepId("");
                  resetPage();
                }}
              >
                <option value="">All contractors</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="Deployment"
              className="field lg:w-56"
              value={dFilter}
              onChange={(e) => {
                setDepId(e.target.value);
                resetPage();
              }}
            >
              <option value="">All deployments</option>
              {deployments.map((o) => (
                <option key={o.d.id} value={o.d.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Skill"
              className="field lg:w-36"
              value={skill}
              onChange={(e) => {
                setSkill(e.target.value as Skill | "");
                resetPage();
              }}
            >
              <option value="">All skills</option>
              {SKILLS.map((s) => (
                <option key={s} value={s}>
                  {SKILL_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <SegmentedControl
            label="Status"
            options={STATUS_OPTIONS}
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              resetPage();
            }}
            className="lg:ml-auto"
          />
        </div>

        {rows.length === 0 ? (
          <div className="p-4">
            {visible.length === 0 ? (
              <Empty title="No workers yet">{can("manageWorkers") ? "Add the first worker to start rostering." : "Workers appear here once they are added."}</Empty>
            ) : (
              <Empty title="No workers match">
                <span className="flex flex-col items-center gap-3">
                  Clear the search or change the filters.
                  {filtered && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setQuery("");
                        setContractorId("");
                        setDepId("");
                        setSkill("");
                        setStatus("active");
                        resetPage();
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </span>
              </Empty>
            )}
          </div>
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className={TABLE}>
                <thead>
                  <tr>
                    <th>Employee code</th>
                    <th>Name</th>
                    <th>Designation</th>
                    <th>Contractor · Department</th>
                    <th>Device ID</th>
                    <th>Mobile</th>
                    <th>Joined</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map(({ w, a, joins }) => (
                    <tr key={w.id} className="cursor-pointer" onClick={() => setOpenId(w.id)}>
                      <td className="font-mono text-[13px] whitespace-nowrap text-muted-foreground">{w.id}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar size="sm">
                            <AvatarFallback className="bg-accent text-[11px] font-medium text-accent-foreground">{initials(w.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="rounded-sm text-left font-medium whitespace-nowrap transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenId(w.id);
                              }}
                            >
                              {w.name}
                              <span className="sr-only"> ({w.id})</span>
                            </button>
                            {w.fatherName && (
                              <p className="text-[12px] whitespace-nowrap text-muted-foreground">
                                <span className="sr-only">Father or guardian: </span>
                                {w.fatherName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className="whitespace-nowrap">{w.designation}</p>
                        {w.skill && <p className="text-[12px] whitespace-nowrap text-muted-foreground">{SKILL_LABEL[w.skill]}</p>}
                      </td>
                      <td>
                        {a ? (
                          <>
                            <p className="whitespace-nowrap">{n.contractor.get(a.contractorId)?.name}</p>
                            <p className="text-[12px] whitespace-nowrap text-muted-foreground">{n.department.get(a.departmentId)?.name}</p>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap">{pending(w) ? <Tag tone="muted">Not enrolled</Tag> : <span className="font-mono text-[13px]">{w.deviceId}</span>}</td>
                      <td className="whitespace-nowrap tabular-nums">{w.mobile ?? "—"}</td>
                      <td className="whitespace-nowrap tabular-nums">{w.joinedOn ? fmtDay(w.joinedOn) : "—"}</td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {w.active ? <Tag tone="ok">Active</Tag> : <Tag tone="muted">Inactive</Tag>}
                          {joins && <Tag tone="day">Joins {fmtDate(joins, false)}</Tag>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-[13px] text-muted-foreground">
              <span className="tabular-nums" aria-live="polite">
                Showing {Math.min(limit, rows.length)} of {rows.length}
              </span>
              {rows.length > limit && (
                <Button size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more
                </Button>
              )}
            </div>
          </>
        )}
      </Panel>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        wide
        title="Add worker"
        description="Fields marked optional can be filled in later from the worker's details."
        footer={
          <>
            <Button onClick={() => setAdding(false)}>{canAdd ? "Cancel" : "Close"}</Button>
            {canAdd && (
              <Button kind="tape" type="submit" form={FORM_ID}>
                Add worker
              </Button>
            )}
          </>
        }
      >
        {adding && (
          <WorkerForm
            onDone={(id) => {
              setAdding(false);
              setOpenId(id);
            }}
          />
        )}
      </Sheet>
      <Sheet
        open={!!open && !adding}
        onClose={() => {
          setOpenId(null);
          setEditingId(null);
        }}
        wide
        title={open?.id ?? ""}
        description={editing ? "Edit details" : undefined}
        footer={
          editing && (
            <>
              <Button onClick={() => setEditingId(null)}>Cancel</Button>
              <Button kind="tape" type="submit" form={FORM_ID}>
                Save changes
              </Button>
            </>
          )
        }
      >
        {open &&
          (editing ? (
            <WorkerForm key={`edit-${open.id}`} worker={open} onDone={() => setEditingId(null)} />
          ) : (
            <WorkerDetail key={open.id} w={open} onEdit={() => setEditingId(open.id)} />
          ))}
      </Sheet>
    </div>
  );
}
