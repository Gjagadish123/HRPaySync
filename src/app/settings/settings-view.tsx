"use client";

import { Check, Minus } from "lucide-react";
import { useId, useState } from "react";
import Link from "next/link";
import { SITE, WORK_DAY_STARTS_AT } from "@/config";
import { ROLE_LABEL, useStore } from "@/components/store";
import { Button, Field, PageHeader, ReadOnlyNote, Tag, useToast } from "@/components/app-ui";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSION_MATRIX, type Permission } from "@/lib/actions";
import type { Policy, Role, RuleMode } from "@/lib/types";
import { SegmentedControl } from "@/components/21st";

const RULE_MODES: { value: RuleMode; label: string }[] = [
  { value: "warn", label: "Warn" },
  { value: "block", label: "Block" },
  { value: "off", label: "Off" },
];

const PERMISSION_LABEL: Record<Permission, string> = {
  manageMasters: "Contractors & strength",
  manageWorkers: "Add / transfer workers",
  editRoster: "Edit roster & shifts",
  createExtra: "Request extra duty",
  forwardExtra: "Send extra duty for approval",
  approveExtra: "Approve / reject / close extra duty",
  manageReplacement: "Assign & confirm relievers",
  markReplacement: "Mark reliever absent, record handover",
  manualPunch: "Add manual punch",
  verifyClient: "Verify / dispute attendance",
  confirmContractor: "Contractor confirmation",
  resolveDispute: "Resolve disputes",
  exportReports: "Export reports",
  viewAudit: "View audit log",
  manageHolidays: "Manage holidays",
  manageDevices: "Attendance devices",
  managePolicy: "Change policy",
};
const ROLES: Role[] = ["CLIENT_ADMIN", "CLIENT_SUPERVISOR", "CONTRACTOR_ADMIN", "ACCOUNTS", "AUDITOR"];

const COUNTING_RULES: { term: string; body: React.ReactNode }[] = [
  {
    term: "Daily headcount",
    body: (
      <>
        A worker counts once on the start date of the shift they reported for. <Tag tone="day">Awaiting client sign-off</Tag>
      </>
    ),
  },
  { term: "Work date cut-over", body: `The board moves to the next work date at ${WORK_DAY_STARTS_AT}, so a running night shift stays on today's board.` },
  { term: "Breaks", body: "Only punched breaks are deducted. Whether the 12 hours include breaks is still an open client question." },
  { term: "Manpower-days vs unique workers", body: "Reported separately everywhere: 20 workers for 30 days is 600 manpower-days but still 20 workers." },
  { term: "Time zone", body: `${SITE.timeZone}. All times are site time with dates shown, so overnight shifts are never ambiguous.` },
];

function PolicyForm() {
  const { world, can, dispatch } = useStore();
  const toast = useToast();
  const formId = useId();
  const p = world.policy;
  const [f, setF] = useState({ ...p, lateGraceMins: String(p.lateGraceMins), minRestHours: String(p.minRestHours), maxContinuousHours: String(p.maxContinuousHours), maxWeeklyHours: String(p.maxWeeklyHours) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editable = can("managePolicy");

  function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const num = (k: "lateGraceMins" | "minRestHours" | "maxContinuousHours" | "maxWeeklyHours", lo: number, hi: number) => {
      const v = Number(f[k]);
      if (!Number.isFinite(v) || v < lo || v > hi) errs[k] = `Between ${lo} and ${hi}.`;
      return v;
    };
    const policy: Policy = {
      lateGraceMins: num("lateGraceMins", 0, 60),
      minRestHours: num("minRestHours", 0, 24),
      minRestMode: f.minRestMode,
      maxContinuousHours: num("maxContinuousHours", 1, 36),
      maxContinuousMode: f.maxContinuousMode,
      maxWeeklyHours: num("maxWeeklyHours", 1, 168),
      maxWeeklyMode: f.maxWeeklyMode,
    };
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const res = dispatch({ type: "policy/set", policy }, `Policy updated: rest ${policy.minRestHours}h (${policy.minRestMode}), continuous ${policy.maxContinuousHours}h (${policy.maxContinuousMode}), weekly ${policy.maxWeeklyHours}h (${policy.maxWeeklyMode}), grace ${policy.lateGraceMins}m`);
    toast(res.ok ? "Policy saved. Checks and lateness use it from now." : res.error, res.ok ? "ok" : "alert");
  }

  const rule = (label: string, k: "minRestHours" | "maxContinuousHours" | "maxWeeklyHours", mode: "minRestMode" | "maxContinuousMode" | "maxWeeklyMode") => (
    <Field label={label} error={errors[k]}>
      {(pp) => (
        <div className="flex flex-wrap gap-2">
          <input {...pp} inputMode="decimal" disabled={!editable} className="field min-w-24 flex-1 tabular-nums" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          <SegmentedControl<RuleMode>
            label={`${label}: when broken`}
            options={RULE_MODES}
            value={f[mode]}
            disabled={!editable}
            onValueChange={(v) => setF({ ...f, [mode]: v })}
          />
        </div>
      )}
    </Field>
  );

  return (
    <Card className="shadow-xs">
      <CardHeader className="border-b">
        <CardTitle role="heading" aria-level={2} className="font-semibold">Working-time policy</CardTitle>
        <CardDescription className="max-w-[72ch]">
          Demo values only. Set these per jurisdiction, establishment and worker category on legal advice; nothing statutory is hard-coded. Beside each limit, choose what happens when it is broken: Warn flags it, Block stops planning, Off skips the check. Actual work is always recorded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form id={formId} onSubmit={save} noValidate className="grid gap-x-6 gap-y-5 lg:grid-cols-2">
          {rule("Minimum rest between duties (hours)", "minRestHours", "minRestMode")}
          {rule("Maximum continuous duty (hours)", "maxContinuousHours", "maxContinuousMode")}
          {rule("Maximum hours in 7 days", "maxWeeklyHours", "maxWeeklyMode")}
          <Field label="Late grace (minutes)" error={errors.lateGraceMins} hint="Also used for reliever lateness.">
            {(pp) => <input {...pp} inputMode="numeric" disabled={!editable} className="field tabular-nums" value={f.lateGraceMins} onChange={(e) => setF({ ...f, lateGraceMins: e.target.value })} />}
          </Field>
        </form>
      </CardContent>
      <CardFooter className={editable ? "justify-end" : undefined}>
        {editable ? (
          <Button kind="tape" type="submit" form={formId}>
            Save policy
          </Button>
        ) : (
          <ReadOnlyNote>Only the client admin can change the policy.</ReadOnlyNote>
        )}
      </CardFooter>
    </Card>
  );
}

export function SettingsView() {
  const { can, resetDemo, log, world } = useStore();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Policy, counting rules, device sources and who may do what." />
      {/* Keyed on the stored policy, so the form reloads its fields after a reset (or any other policy change). */}
      <PolicyForm key={JSON.stringify(world.policy)} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="font-semibold">Counting rules</CardTitle>
            <CardDescription>How headcount, work dates and hours are counted in every report.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y rounded-lg border text-[14px]">
              {COUNTING_RULES.map((r) => (
                <div key={r.term} className="flex flex-col gap-1 px-3 py-2.5">
                  <dt className="font-medium">{r.term}</dt>
                  <dd className="text-muted-foreground">{r.body}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="font-semibold">Attendance sources</CardTitle>
            <CardDescription>Where punches come from. Devices are simulated in this demo; add or change them under <Link href="/devices" className="font-medium text-primary underline-offset-4 hover:underline">Devices</Link>.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="divide-y rounded-lg border text-[14px]">
              {world.devices.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] text-muted-foreground">{d.id}</span>
                  <span className="min-w-0 flex-1">{d.name} · {d.location}</span>
                  <Tag tone="muted">{d.active ? "Simulated" : "Disabled"}</Tag>
                </li>
              ))}
              <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] text-muted-foreground">MANUAL</span>
                <span className="min-w-0 flex-1">Authorised correction with reason and approver</span>
              </li>
            </ul>
            <p className="text-[13px] text-muted-foreground">
              Device integration is not connected in this demo. The meaning of the client&apos;s “two systems”, device make, model and API are open questions to settle before integration.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0 shadow-xs">
        <CardHeader className="border-b py-4">
          <CardTitle role="heading" aria-level={2} className="font-semibold">Permission matrix</CardTitle>
          <CardDescription>Contractor admins are additionally limited to their own contractor&apos;s workers, roster and reports.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {/* relative: the cells hold sr-only labels (absolutely positioned); without it they escape the scroller and widen the page. */}
          <div className="relative overflow-x-auto">
            <table className="grid-table [&_td]:align-middle">
              <thead>
                <tr>
                  <th className="sticky left-0 z-2 border-r pl-4">Permission</th>
                  {ROLES.map((r) => (
                    <th key={r} className="text-center">{ROLE_LABEL[r].split(" · ")[0]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(PERMISSION_LABEL) as Permission[]).map((p) => (
                  <tr key={p} className="group">
                    <th scope="row" className="sticky left-0 z-1 min-w-44 border-r bg-card py-2 pl-4 text-left text-[14px] font-normal whitespace-normal text-foreground group-hover:bg-muted sm:whitespace-nowrap">
                      {PERMISSION_LABEL[p]}
                    </th>
                    {ROLES.map((r) => (
                      <td key={r} className="text-center">
                        {PERMISSION_MATRIX[p].includes(r) ? (
                          <span className="inline-flex size-6 items-center justify-center rounded-md bg-accent text-accent-foreground">
                            <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                            <span className="sr-only">Allowed</span>
                          </span>
                        ) : (
                          <span className="inline-flex size-6 items-center justify-center text-muted-foreground/60">
                            <Minus className="size-3.5" aria-hidden />
                            <span className="sr-only">Not allowed</span>
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {can("managePolicy") && (
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="font-semibold">Demo data</CardTitle>
            <CardDescription>
              {log.length} change{log.length === 1 ? "" : "s"} saved in this browser. Resetting regenerates the synthetic data and clears the audit log.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {confirming ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <p role="alert" className="min-w-0 flex-1 text-[13px] font-medium text-destructive">This can&apos;t be undone.</p>
                <Button kind="quiet" onClick={() => setConfirming(false)}>
                  Keep my changes
                </Button>
                <Button
                  kind="danger"
                  onClick={() => {
                    resetDemo();
                    setConfirming(false);
                    toast("Demo data reset.");
                  }}
                >
                  Yes, reset everything
                </Button>
              </div>
            ) : (
              <Button kind="danger" onClick={() => setConfirming(true)}>
                Reset demo data
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
