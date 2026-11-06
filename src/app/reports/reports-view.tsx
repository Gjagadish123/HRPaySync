"use client";

import { Download } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { APP_NAME, CLIENT_NAME, SITE } from "@/config";
import { STATUS_TEXT, markFor } from "@/components/session-detail";
import { Tabs } from "@/components/21st";
import { Card, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useStore } from "@/components/store";
import { Button, Empty, Field, Mark, PageHeader, ReadOnlyNote, Tag, cx, useToast } from "@/components/app-ui";
import { isPresent } from "@/lib/attendance";
import { exportDailySummary, exportEmployeeRows, exportInvoiceSupport, sheetName } from "@/lib/excel";
import { dailySummary, employeeRows, invoiceSupport } from "@/lib/reports";
import { addMonths, fmtDT, fmtDate, fmtDur, fmtMonth, monthOf } from "@/lib/time";

type Tab = "daily" | "employee" | "invoice";
const PREVIEW = 150;

const SHIFT_CHIP: Record<string, string> = {
  D: "bg-shift-day text-shift-day-foreground",
  N: "bg-shift-night text-shift-night-foreground",
  G: "bg-shift-general text-shift-general-foreground ring-1 ring-inset ring-primary",
};

const VERIFY_TONE = { Verified: "ok", Pending: "muted", Disputed: "alert" } as const;

function ExportButton({ label, run }: { label: string; run: () => Promise<void> }) {
  const { can } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!can("exportReports")) return null;
  return (
    <Button
      kind="tape"
      className="shrink-0"
      disabled={busy}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await run();
          toast(`${label} downloaded.`);
        } catch (e) {
          toast(`Export failed: ${e instanceof Error ? e.message : "unknown error"}. Try again.`, "alert");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner aria-hidden /> : <Download className="size-4" aria-hidden />} {busy ? "Preparing…" : `Download ${label}`}
    </Button>
  );
}

/** A report: title, one-line description and the download, then the preview. */
function ReportCard({ title, description, action, children }: { title: string; description: ReactNode; action: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-0 py-0 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b px-4 py-4 sm:px-5">
        <div className="min-w-0 max-w-[75ch]">
          <h2 className="text-base font-semibold">{title}</h2>
          <CardDescription className="mt-1 text-[13px]">{description}</CardDescription>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function DailyTab({ month }: { month: string }) {
  const { world, idx, viewer } = useStore();
  const s = useMemo(() => dailySummary(world, idx, viewer, month), [world, idx, viewer, month]);
  // Consecutive departments of one contractor share a header cell, as merged cells do in the workbook.
  const edge = (i: number) => i > 0 && s.deployments[i - 1].contractorId !== s.deployments[i].contractorId;
  const groups: { start: number; name: string; span: number }[] = [];
  s.deployments.forEach((_, i) => {
    const g = groups.at(-1);
    if (g && !edge(i)) g.span++;
    else groups.push({ start: i, name: s.labels[i].contractor, span: 1 });
  });
  const sticky = (fill: string) => cx("sticky left-0 z-[1] border-r", fill);
  const cell = (i: number) => cx("text-center", edge(i) && "border-l");
  return (
    <ReportCard
      title={`Daily contractor manpower · ${fmtMonth(month)}`}
      description={
        <>
          The download matches the client&apos;s Daily Manpower Summary workbook layout (sheet <span className="font-medium text-foreground">{sheetName(month)}</span>). Every calendar day is listed and totals run through day {s.days.length}. Counts below 80% of approved strength are shown in red.
        </>
      }
      action={<ExportButton label="daily summary" run={() => exportDailySummary(s, { client: CLIENT_NAME, site: SITE.name })} />}
    >
      <div className="relative max-h-[70vh] overflow-auto">
        <table className="grid-table text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-[3] h-12 min-w-[150px] border-r bg-accent font-semibold text-accent-foreground">Contractor</th>
              {groups.map((g) => (
                <th
                  key={g.start}
                  colSpan={g.span}
                  title={g.name}
                  className={cx("z-[2] h-12 bg-accent text-center font-semibold whitespace-normal text-accent-foreground", g.start > 0 && "border-l")}
                >
                  <span className="line-clamp-2">{g.name}</span>
                </th>
              ))}
              <th rowSpan={2} className="z-[2] border-l text-center font-semibold text-foreground">Total</th>
              <th rowSpan={2} className="z-[2] min-w-[420px] border-l font-semibold text-foreground">Remarks</th>
            </tr>
            <tr>
              <th className="sticky left-0 top-12 z-[3] border-r font-semibold text-foreground">Department</th>
              {s.labels.map((l, i) => (
                <th key={i} className={cx("top-12 z-[2] min-w-[112px] py-2 font-medium whitespace-normal text-foreground", cell(i))}>
                  {l.department}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {([["Manpower as per licence", s.licensed], ["Manpower as per approval", s.approved]] as const).map(([label, vals]) => (
              <tr key={label} className="group font-semibold text-primary hover:bg-muted">
                <td className={sticky("bg-card group-hover:bg-muted")}>{label}</td>
                {vals.map((v, i) => <td key={i} className={cell(i)}>{v}</td>)}
                <td className="border-l text-center">{vals.reduce((a, b) => a + b, 0)}</td>
                <td className="border-l" />
              </tr>
            ))}
            {s.days.map((d) => (
              <tr key={d.date} className={cx("group", d.holiday ? "bg-muted" : "hover:bg-muted")}>
                <td className={cx(sticky(d.holiday ? "bg-muted" : "bg-card group-hover:bg-muted"), "whitespace-nowrap", d.total === null && "text-muted-foreground")}>
                  {fmtDate(d.date)}
                </td>
                {d.counts.map((c, i) => (
                  <td key={i} className={cx(cell(i), c !== null && c < s.approved[i] * 0.8 && !d.holiday && "text-destructive")}>{c}</td>
                ))}
                <td className="border-l text-center font-semibold">{d.total}</td>
                <td className="border-l text-[12px] leading-snug text-muted-foreground">{d.remarks}</td>
              </tr>
            ))}
            <tr className="bg-muted font-semibold">
              <td className={sticky("bg-muted")}>
                Total manpower<span className="block text-[12px] font-normal text-muted-foreground">manpower-days</span>
              </td>
              {s.monthTotals.map((t, i) => <td key={i} className={cell(i)}>{t}</td>)}
              <td className="border-l text-center">{s.grandTotal}</td>
              <td className="border-l text-[12px] font-normal text-muted-foreground">
                Through {fmtDate(s.days.at(-1)!.date)}. Red figures are below 80% of approved strength.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </ReportCard>
  );
}

function EmployeeTab({ month }: { month: string }) {
  const { world, idx, viewer } = useStore();
  const [contractorId, setContractor] = useState("");
  const [departmentId, setDepartment] = useState("");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => employeeRows(world, idx, viewer, month, { contractorId, departmentId, query }), [world, idx, viewer, month, contractorId, departmentId, query]);
  const showContractor = viewer.role !== "CONTRACTOR_ADMIN";
  return (
    <ReportCard
      title={`Employee-wise attendance · ${fmtMonth(month)}`}
      description={`${rows.length} shift rows · ${new Set(rows.filter((r) => isPresent(r.session)).map((r) => r.workerId)).size} unique workers present. Overnight IN and OUT always show both date and time.`}
      action={<ExportButton label="employee report" run={() => exportEmployeeRows(rows, month, SITE.name)} />}
    >
      <div className={cx("grid gap-3 border-b px-4 py-4 sm:px-5", showContractor ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {showContractor && (
          <Field label="Contractor">
            {(p) => (
              <select {...p} className="field" value={contractorId} onChange={(e) => setContractor(e.target.value)}>
                <option value="">All contractors</option>
                {world.contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
        )}
        <Field label="Department">
          {(p) => (
            <select {...p} className="field" value={departmentId} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {world.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Employee">{(p) => <input {...p} type="search" className="field" placeholder="ID or name" value={query} onChange={(e) => setQuery(e.target.value)} />}</Field>
      </div>
      {rows.length === 0 ? (
        <div className="p-4 sm:p-5">
          <Empty title="No shifts for these filters">Clear a filter or pick another month.</Empty>
        </div>
      ) : (
        <>
          <div className="relative max-h-[65vh] overflow-auto">
            <table className="grid-table text-[13px]">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Work date</th>
                  <th>Shift</th>
                  <th>Scheduled</th>
                  <th>Actual IN</th>
                  <th>Actual OUT</th>
                  <th className="num">Break</th>
                  <th className="num">Net</th>
                  <th className="num">Extra</th>
                  <th>Status</th>
                  <th>Verified</th>
                  <th>Exceptions</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PREVIEW).map((r) => (
                  <tr key={r.session.assignment.id}>
                    <td className="whitespace-nowrap">
                      <span className="block font-mono text-[12px] text-muted-foreground">{r.workerId}</span>
                      <span className="font-medium">{r.name}</span>
                    </td>
                    <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="whitespace-nowrap">
                      <span className={cx("inline-flex size-6 items-center justify-center rounded-md text-[12px] font-semibold", SHIFT_CHIP[r.shift] ?? "bg-muted text-foreground")}>{r.shift}</span>
                      {r.isExtraShift && <Tag className="ml-1.5">Extra shift</Tag>}
                    </td>
                    <td className="font-mono text-[12px] whitespace-nowrap">{fmtDT(r.session.sched.from)}<br />{fmtDT(r.session.sched.to)}</td>
                    <td className="font-mono text-[12px] whitespace-nowrap">{fmtDT(r.session.in)}</td>
                    <td className="font-mono text-[12px] whitespace-nowrap">{fmtDT(r.session.out)}</td>
                    <td className="num">{fmtDur(r.session.breakMins)}</td>
                    <td className="num">{fmtDur(r.session.netMins)}</td>
                    <td className={cx("num", r.extraMins > 0 && "font-semibold text-destructive")}>{r.extraMins ? fmtDur(r.extraMins) : "—"}</td>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Mark kind={markFor(r.session)} label={false} />
                        {STATUS_TEXT[r.session.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      {isPresent(r.session) ? <Tag tone={VERIFY_TONE[r.verification as keyof typeof VERIFY_TONE] ?? "ink"}>{r.verification}</Tag> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="min-w-[180px] text-[12px] leading-snug text-muted-foreground">{r.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > PREVIEW && (
            <p className="border-t px-4 py-3 text-[13px] text-muted-foreground sm:px-5">
              Preview shows {PREVIEW} of {rows.length} rows. The download contains all of them.
            </p>
          )}
        </>
      )}
    </ReportCard>
  );
}

function InvoiceTab({ month }: { month: string }) {
  const { world, idx, viewer } = useStore();
  const lines = useMemo(() => invoiceSupport(employeeRows(world, idx, viewer, month), world, viewer, month), [world, idx, viewer, month]);
  const sum = (k: "manpowerDays" | "verifiedDays" | "pendingDays" | "disputed" | "missingPunch" | "extraMins") => lines.reduce((a, l) => a + l[k], 0);
  return (
    <ReportCard
      title={`Invoice support · ${fmtMonth(month)}`}
      description="Attendance evidence for checking contractor invoices. Manpower-days and unique workers are different measures; billing rates stay outside this report."
      action={<ExportButton label="invoice support" run={() => exportInvoiceSupport(lines, month, { client: CLIENT_NAME, site: SITE.name })} />}
    >
      <div className="relative overflow-x-auto">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Contractor · department</th>
              <th className="num">Approved</th>
              <th className="num">Manpower-days</th>
              <th className="num">Verified</th>
              <th className="num">Pending</th>
              <th className="num">Disputed</th>
              <th className="num">Missing OUT</th>
              <th className="num">Extra duty</th>
              <th className="num">Unique workers</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.deployment.id}>
                <td className="font-medium">{l.label}</td>
                <td className="num">{l.approved}</td>
                <td className="num">{l.manpowerDays}</td>
                <td className="num">{l.verifiedDays}</td>
                <td className={cx("num", l.pendingDays > 0 && "font-semibold")}>{l.pendingDays}</td>
                <td className={cx("num", l.disputed > 0 && "font-semibold text-destructive")}>{l.disputed}</td>
                <td className={cx("num", l.missingPunch > 0 && "font-semibold text-destructive")}>{l.missingPunch}</td>
                <td className="num">{fmtDur(l.extraMins)}</td>
                <td className="num">{l.uniqueWorkers}</td>
              </tr>
            ))}
            <tr className="bg-muted font-semibold hover:bg-muted">
              <td>Total</td>
              <td className="num">{lines.reduce((a, l) => a + l.approved, 0)}</td>
              <td className="num">{sum("manpowerDays")}</td>
              <td className="num">{sum("verifiedDays")}</td>
              <td className="num">{sum("pendingDays")}</td>
              <td className="num">{sum("disputed")}</td>
              <td className="num">{sum("missingPunch")}</td>
              <td className="num">{fmtDur(sum("extraMins"))}</td>
              <td className="num text-muted-foreground">—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t px-4 py-3 text-[13px] text-muted-foreground sm:px-5">
        Approve invoices only after pending, disputed and missing-OUT records are cleared on the Attendance screen.
      </p>
    </ReportCard>
  );
}

export function ReportsView() {
  const { world, can } = useStore();
  const months = [addMonths(monthOf(world.today), -1), monthOf(world.today)];
  const [month, setMonth] = useState(months[1]);
  const [tab, setTab] = useState<Tab>("daily");
  return (
    <div>
      <PageHeader
        title="Reports"
        description={`Excel reports generated from verified attendance in ${APP_NAME}. Months in progress show days to date only.`}
        actions={
          <Field label="Month" className="min-w-[160px]">
            {(p) => (
              <select {...p} className="field" value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </select>
            )}
          </Field>
        }
      />
      <Tabs
        label="Report"
        value={tab}
        onChange={(t) => setTab(t as typeof tab)}
        tabs={[
          { id: "daily", label: "Daily manpower summary" },
          { id: "employee", label: "Employee-wise attendance" },
          { id: "invoice", label: "Invoice support" },
        ]}
      >
        {(t) => (
          <div className="flex flex-col gap-4">
            {!can("exportReports") && <ReadOnlyNote>Your role can view but not download reports.</ReadOnlyNote>}
            {t === "daily" && <DailyTab month={month} />}
            {t === "employee" && <EmployeeTab month={month} />}
            {t === "invoice" && <InvoiceTab month={month} />}
          </div>
        )}
      </Tabs>
    </div>
  );
}
