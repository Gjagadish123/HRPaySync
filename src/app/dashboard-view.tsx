"use client";

import { ArrowRight, CircleCheck, Clock4, Factory, FileSpreadsheet, LayoutGrid, Repeat2, ShieldCheck, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Label, Line, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Timeline } from "@/components/21st";
import { Empty, PageHeader, Tag, buttonClass, cx } from "@/components/app-ui";
import { exceptions, scopedSessions } from "@/components/scope";
import { StatCard } from "@/components/stat-card";
import { useStore } from "@/components/store";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Empty as EmptyFrame, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SITE } from "@/config";
import { awaitingVerification, isPresent } from "@/lib/attendance";
import { presentByDeployment } from "@/lib/reports";
import { addDays, dateOf, dateRange, fmtDate, fmtDur, fmtMonth, monthDays, monthOf, timeOf } from "@/lib/time";
import type { DateStr } from "@/lib/types";
import { OPEN_REPLACEMENT, extraView, replacementView } from "@/lib/workflow";
import { canSeeDeployment, canSeeWorker, isHoliday, strengthOn } from "@/lib/world";

const label = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

const trendConfig = {
  present: { label: "Present", color: "var(--chart-1)" },
  approved: { label: "Approved strength", color: "var(--chart-4)" },
} satisfies ChartConfig;

const groupConfig = {
  approved: { label: "Approved", color: "var(--chart-3)" },
  present: { label: "Present", color: "var(--chart-1)" },
} satisfies ChartConfig;

const SHIFT_COLOR: Record<string, string> = { D: "var(--chart-1)", N: "var(--chart-4)", G: "var(--chart-2)" };

type ActivityEvent = { at: string; title: ReactNode; by?: string; note?: string };

export function DashboardView() {
  const { world, idx, n, viewer, log, can } = useStore();
  const showLog = can("viewAudit");

  const data = useMemo(() => {
    const today = world.today;
    const month = monthOf(today);
    const seeWorker = (id: string, date: DateStr) => {
      const w = n.worker.get(id);
      return !!w && canSeeWorker(viewer, w, date);
    };

    const deps = world.deployments.filter((d) => canSeeDeployment(viewer, d));
    const sessions = scopedSessions(world, idx, n, viewer, today);
    const all = sessions.map((s) => s.session);

    // Same counting as the shift board: each worker once per deployment, on their shift start date.
    const rows = deps
      .map((d) => {
        const mine = sessions.filter((s) => s.deploymentId === d.id).map((s) => s.session);
        const approved = strengthOn(d, today).approved;
        const present = new Set(mine.filter(isPresent).map((s) => s.assignment.workerId)).size;
        return {
          d,
          contractor: n.contractor.get(d.contractorId)?.name ?? "?",
          department: n.department.get(d.departmentId)?.name ?? "?",
          approved,
          present,
          later: mine.filter((s) => s.status === "UPCOMING").length,
          short: approved - present,
        };
      })
      .sort((a, b) => b.short - a.short || a.contractor.localeCompare(b.contractor));

    const upcoming = all.filter((s) => s.status === "UPCOMING");
    const totals = {
      present: rows.reduce((s, r) => s + r.present, 0),
      approved: rows.reduce((s, r) => s + r.approved, 0),
      later: rows.reduce((s, r) => s + r.later, 0),
      absent: all.filter((s) => s.status === "ABSENT").length,
      late: all.filter((s) => s.lateMins > 0).length,
      nextStart: upcoming.map((s) => s.sched.from).sort()[0],
    };

    // Rolling 30 days, so the trend reads the same on the 2nd of a month as on the 28th.
    const trend = dateRange(addDays(today, -29), today).map((date) => {
        const present = presentByDeployment(world, idx, date);
        return {
          date,
          day: fmtDate(date).replace(/^\w+ /, ""),
          present: deps.reduce((s, d) => s + (present.get(d.id)?.size ?? 0), 0),
          approved: deps.reduce((s, d) => s + strengthOn(d, date).approved, 0),
          holiday: isHoliday(world, date)?.name,
        };
      });

    // A contractor admin sees one contractor, so their bars split by department instead.
    const byContractor = new Set(deps.map((d) => d.contractorId)).size > 1;
    const groups = new Map<string, { label: string; present: number; approved: number }>();
    for (const r of rows) {
      const key = byContractor ? r.d.contractorId : r.d.departmentId;
      const g = groups.get(key) ?? { label: byContractor ? r.contractor : r.department, present: 0, approved: 0 };
      g.present += r.present;
      g.approved += r.approved;
      groups.set(key, g);
    }

    const shifts = world.shifts.map((sh) => {
      const list = all.filter((s) => s.shift.id === sh.id);
      return {
        code: sh.code,
        name: sh.name,
        hours: `${sh.start}–${sh.end}`,
        start: sh.start,
        rostered: list.length,
        present: list.filter(isPresent).length,
        upcoming: list.filter((s) => s.status === "UPCOMING").length,
        fill: SHIFT_COLOR[sh.code] ?? "var(--chart-5)",
      };
    });

    const extras = world.extraDuties.filter((x) => seeWorker(x.workerId, dateOf(x.plannedStart)));
    const monthExtras = extras.filter((x) => monthOf(dateOf(x.plannedStart)) === month);
    const extra = {
      count: monthExtras.length,
      mins: monthExtras.reduce((s, x) => s + extraView(world, idx, x).actual.mins, 0),
      pending: monthExtras.filter((x) => x.status === "REQUESTED" || x.status === "PENDING_APPROVAL").length,
    };

    const repls = world.replacements.filter((r) => seeWorker(r.outgoingWorkerId, dateOf(r.plannedReportAt)));
    const open = repls.map((r) => replacementView(world, idx, r)).filter((v) => OPEN_REPLACEMENT.includes(v.status) && !v.arrival);
    const repl = {
      open: open.length,
      unassigned: open.filter((v) => v.status === "NOT_ASSIGNED").length,
      late: open.filter((v) => v.status !== "NOT_ASSIGNED" && (v.overdue || v.status === "LATE")).length,
      overdue: open.some((v) => v.overdue),
    };

    // Verification backlog: the same rows as Attendance → this month → "Not verified", which the card links to.
    let pending = 0;
    for (const date of monthDays(month)) {
      if (date > today) break;
      for (const { session } of scopedSessions(world, idx, n, viewer, date)) {
        if (awaitingVerification(session, world.verifications[session.assignment.id])) pending++;
      }
    }
    const disputed = Object.values(world.verifications).filter((v) => {
      if (v.client !== "DISPUTED" || v.resolved) return false;
      const a = n.assignment.get(v.key);
      return !!a && seeWorker(a.workerId, a.date);
    }).length;

    const workers = world.workers.filter((w) => w.active && canSeeWorker(viewer, w, today)).length;

    const events: ActivityEvent[] = [];
    for (const x of extras) {
      const who = n.worker.get(x.workerId)?.name ?? x.workerId;
      for (const h of x.history) {
        events.push({
          at: h.at,
          title: <Link href={`/extra-duty#${x.id}`} className="hover:text-primary hover:underline">Extra duty {label(h.status).toLowerCase()}</Link>,
          by: h.by,
          note: `${who} (${x.workerId})${h.note ? ` · ${h.note}` : ""}`,
        });
      }
    }
    for (const r of repls) {
      const who = n.worker.get(r.outgoingWorkerId)?.name ?? r.outgoingWorkerId;
      for (const h of r.history) {
        events.push({
          at: h.at,
          title: <Link href={`/replacements#${r.id}`} className="hover:text-primary hover:underline">Replacement {label(h.status).toLowerCase()}</Link>,
          by: h.by,
          note: `Relieving ${who} (${r.outgoingWorkerId})${h.note ? ` · ${h.note}` : ""}`,
        });
      }
    }
    // Extra-duty and replacement changes already appear above through their own history.
    if (showLog) for (const e of log) if (!e.action.type.startsWith("extra/") && !e.action.type.startsWith("repl/")) events.push({ at: e.at, title: e.summary, by: e.by });
    const activity = events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8).reverse();

    return {
      today,
      month,
      deps,
      rows,
      totals,
      trend,
      byContractor,
      groups: [...groups.values()].sort((a, b) => b.approved - a.approved),
      shifts,
      extra,
      repl,
      verify: { pending, disputed },
      workforce: { workers, contractors: new Set(deps.map((d) => d.contractorId)).size, departments: new Set(deps.map((d) => d.departmentId)).size },
      ex: exceptions(world, idx, n, viewer),
      activity,
    };
  }, [world, idx, n, viewer, log, showLog]);

  const { today, month, totals, rows, trend, groups, shifts, extra, repl, verify, workforce, ex, activity } = data;
  const holiday = isHoliday(world, today);
  const scopeName = viewer.role === "CONTRACTOR_ADMIN" ? n.contractor.get(viewer.contractorId ?? "")?.name : null;

  const header = (
    <PageHeader
      title="Dashboard"
      description={
        <>
          {holiday ? `Holiday: ${holiday.name}. ` : ""}Work date {fmtDate(today)} at {SITE.name}, as of {timeOf(world.now)}.
          {scopeName ? ` Showing ${scopeName} only.` : ""}
        </>
      }
      actions={
        <>
          <Link href="/board" className={buttonClass("tape")}>
            <LayoutGrid aria-hidden /> Shift board
          </Link>
          <Link href="/reports" className={buttonClass("plain")}>
            <FileSpreadsheet aria-hidden /> Reports
          </Link>
        </>
      }
    />
  );

  if (data.deps.length === 0) {
    return (
      <div>
        {header}
        <Empty title="No deployments to show">
          {scopeName ?? "This contractor"} has no contractor-department deployments yet. Plant HR adds them under Masters, Contractors.
        </Empty>
      </div>
    );
  }

  const fill = pct(totals.present, totals.approved);
  const shortBy = totals.approved - totals.present;
  const lastDay = trend[trend.length - 1];
  const peak = Math.max(...trend.map((t) => t.present));
  const rostered = shifts.reduce((s, x) => s + x.rostered, 0);
  const groupNoun = data.byContractor ? "contractor" : "department";

  return (
    <div className="flex flex-col gap-4">
      {header}

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          title="Present today"
          icon={UserCheck}
          href="/board"
          value={totals.present}
          suffix={`/ ${totals.approved}`}
          progress={{ value: fill, label: `${fill}% of approved strength present` }}
          detail={
            <>
              {fill}% of approved
              {totals.later > 0 && totals.nextStart ? ` · ${totals.later} due at ${timeOf(totals.nextStart)}` : ""}
            </>
          }
        />
        <StatCard
          title="Absent today"
          icon={UserX}
          href={`/attendance?date=${today}&status=ABSENT`}
          value={totals.absent}
          detail={`${totals.late} late · on shifts already started`}
        />
        <StatCard
          title={`Extra duty · ${fmtMonth(month)}`}
          icon={Clock4}
          href="/extra-duty"
          value={fmtDur(extra.mins)}
          suffix="worked"
          badge={extra.pending > 0 ? <Tag tone="day">{extra.pending} to approve</Tag> : undefined}
          detail={`${extra.count} request${extra.count === 1 ? "" : "s"} this month`}
        />
        <StatCard
          title="Open replacements"
          icon={Repeat2}
          href="/replacements"
          value={repl.open}
          badge={repl.overdue ? <Tag tone="alert">Overdue</Tag> : undefined}
          detail={`${repl.unassigned} unassigned · ${repl.late} late or overdue`}
        />
        <StatCard
          title="Awaiting verification"
          icon={ShieldCheck}
          href="/attendance?range=month&status=UNVERIFIED"
          value={verify.pending}
          suffix="shifts"
          badge={verify.disputed > 0 ? <Tag tone="alert">{verify.disputed} disputed</Tag> : undefined}
          detail="Present shifts this month not yet verified"
        />
        <StatCard
          title="Active workforce"
          icon={Factory}
          href="/workers"
          value={workforce.workers}
          suffix="workers"
          detail={`${workforce.contractors} contractor${workforce.contractors === 1 ? "" : "s"} · ${workforce.departments} department${workforce.departments === 1 ? "" : "s"}`}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="font-semibold">Daily manpower · last 30 days</CardTitle>
            <CardDescription>Workers present each day against approved strength. Today is counted so far.</CardDescription>
            <CardAction>
              <ul className="flex flex-col gap-1 text-[12px] text-muted-foreground sm:flex-row sm:gap-3" aria-label="Legend">
                <li className="flex items-center gap-1.5">
                  <span aria-hidden className="h-0.5 w-4 rounded-full bg-chart-1" />
                  Present
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden className="w-4 border-t-2 border-dashed border-chart-4" />
                  Approved
                </li>
              </ul>
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1">
            <ChartContainer
              config={trendConfig}
              className="aspect-auto h-full min-h-[260px] w-full"
              role="img"
              aria-label={`Present workers per day over the last 30 days. Today ${lastDay.present} present so far against ${lastDay.approved} approved; highest day ${peak}.`}
            >
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dash-present-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-present)" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="var(--color-present)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as (typeof trend)[number] | undefined;
                        if (!row) return null;
                        return `${fmtDate(row.date)}${row.date === today ? " · so far" : ""}${row.holiday ? ` · ${row.holiday}` : ""}`;
                      }}
                    />
                  }
                />
                <Area isAnimationActive={false} dataKey="present" type="linear" stroke="var(--color-present)" strokeWidth={2} fill="url(#dash-present-fill)" dot={{ r: 2.5, fill: "var(--color-present)", strokeWidth: 0 }} />
                <Line isAnimationActive={false} dataKey="approved" type="stepAfter" stroke="var(--color-approved)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </ComposedChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="font-semibold">Needs attention</CardTitle>
            <CardDescription>{ex.length ? `${ex.length} item${ex.length === 1 ? "" : "s"}, most urgent first.` : "Nothing waiting on anyone."}</CardDescription>
            {ex.length > 0 && (
              <CardAction>
                <Link href="/board" className="text-[13px] font-medium text-primary hover:underline">
                  Open queue
                </Link>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="flex-1">
            {ex.length === 0 ? (
              <EmptyFrame className="h-full p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="bg-success/10 text-success">
                    <CircleCheck aria-hidden />
                  </EmptyMedia>
                  <EmptyTitle>All clear</EmptyTitle>
                  <EmptyDescription>Every replacement, extra duty and punch is in order.</EmptyDescription>
                </EmptyHeader>
              </EmptyFrame>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {ex.slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <Link
                      href={e.href}
                      className="group/item flex flex-col gap-1 rounded-lg px-2 py-2.5 transition-colors duration-150 ease-out outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-medium">{e.title}</span>
                        <Tag tone={e.severity === "alert" ? "alert" : "day"} className="shrink-0">
                          {e.severity === "alert" ? "Urgent" : "Review"}
                        </Tag>
                      </span>
                      <span className="line-clamp-2 text-[13px] text-muted-foreground">{e.detail}</span>
                      <span className="flex items-center gap-1 text-[13px] font-medium text-primary">
                        {e.action}
                        <ArrowRight className="size-3.5 transition-transform duration-150 ease-out group-hover/item:translate-x-0.5" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
                {ex.length > 5 && (
                  <li className="px-2 pt-2 text-[13px] text-muted-foreground">
                    {ex.length - 5} more on the{" "}
                    <Link href="/board" className="font-medium text-primary hover:underline">
                      shift board
                    </Link>
                    .
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="font-semibold">Present vs approved by {groupNoun}</CardTitle>
            <CardDescription>Today, on shifts already started.</CardDescription>
            <CardAction>
              <ul className="flex flex-col gap-1 text-[12px] text-muted-foreground sm:flex-row sm:gap-3" aria-label="Legend">
                <li className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-sm bg-chart-1" />
                  Present
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-sm bg-chart-3" />
                  Approved
                </li>
              </ul>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={groupConfig}
              className="aspect-auto w-full"
              style={{ height: groups.length * 52 + 32 }}
              role="img"
              aria-label={`Present against approved by ${groupNoun}: ${groups.map((g) => `${g.label} ${g.present} of ${g.approved}`).join("; ")}.`}
            >
              <BarChart data={groups} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid horizontal={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  width={140}
                  tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent />} />
                <Bar dataKey="present" fill="var(--color-present)" radius={4} barSize={10} />
                <Bar dataKey="approved" fill="var(--color-approved)" radius={4} barSize={10} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="font-semibold">Today&apos;s shifts</CardTitle>
            <CardDescription>Rostered workers by shift, and how many have reported.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {rostered === 0 ? (
              <Empty title="No one rostered today">Shifts appear here once the roster for {fmtDate(today)} is set.</Empty>
            ) : (
              <div className="grid items-center gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
                <ChartContainer
                  config={Object.fromEntries(shifts.map((s) => [s.code, { label: s.name, color: s.fill }]))}
                  className="mx-auto aspect-square w-full max-w-[200px]"
                  role="img"
                  aria-label={`Rostered today: ${shifts.map((s) => `${s.name} ${s.rostered}`).join(", ")}; ${rostered} in all.`}
                >
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="code" hideLabel />} />
                    <Pie data={shifts.filter((s) => s.rostered > 0)} dataKey="rostered" nameKey="code" innerRadius={58} outerRadius={88} stroke="var(--background)" strokeWidth={2}>
                      <Label
                        content={({ viewBox }) =>
                          viewBox && "cx" in viewBox && "cy" in viewBox ? (
                            <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                              <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 6} className="fill-foreground text-2xl font-semibold">
                                {rostered}
                              </tspan>
                              <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 16} className="fill-muted-foreground text-[12px]">
                                rostered
                              </tspan>
                            </text>
                          ) : null
                        }
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <ul className="flex flex-col divide-y">
                  {shifts.map((s) => (
                    <li key={s.code} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: s.fill }} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{s.name}</span>
                        <span className="block text-[12px] text-muted-foreground">{s.hours}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-medium tabular-nums">
                          {s.present} / {s.rostered}
                        </span>
                        <span className="block text-[12px] text-muted-foreground">
                          {s.rostered === 0 ? "None rostered" : s.upcoming === s.rostered ? `Starts ${s.start}` : `${pct(s.present, s.rostered)}% present`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="font-semibold">Department strength</CardTitle>
            <CardDescription>
              {shortBy > 0 ? `${shortBy} short of approved strength today` : shortBy < 0 ? `${-shortBy} above approved strength today` : "At approved strength today"}, largest shortfall first.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table className="text-[14px]">
              <TableCaption className="sr-only">Approved strength, present today and shortfall for each contractor department.</TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Contractor</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Present</TableHead>
                  <TableHead className="text-right">Due later</TableHead>
                  <TableHead className="text-right">Shortfall</TableHead>
                  <TableHead className="pr-4">Fill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const p = pct(r.present, r.approved);
                  return (
                    <TableRow key={r.d.id}>
                      <TableCell className="max-w-[220px] truncate pl-4" title={r.contractor}>
                        {r.contractor}
                      </TableCell>
                      <TableCell>{r.department}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.approved}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.present}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{r.later || "—"}</TableCell>
                      <TableCell className={cx("text-right tabular-nums", r.short > 0 ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {r.short > 0 ? `−${r.short}` : r.short < 0 ? `+${-r.short} over` : "At strength"}
                      </TableCell>
                      <TableCell className="pr-4">
                        <span className="flex items-center gap-2">
                          <Progress value={Math.min(100, p)} aria-label={`${r.contractor} ${r.department}: ${p}% filled`} className="h-1.5 w-20" />
                          <span className="w-10 text-right text-[13px] text-muted-foreground tabular-nums">{r.approved ? `${p}%` : "—"}</span>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="pl-4 font-semibold" colSpan={2}>
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{totals.approved}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{totals.present}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.later || "—"}</TableCell>
                  <TableCell className={cx("text-right font-semibold tabular-nums", shortBy > 0 && "text-destructive")}>
                    {shortBy > 0 ? `−${shortBy}` : shortBy < 0 ? `+${-shortBy} over` : "At strength"}
                  </TableCell>
                  <TableCell className="pr-4">
                    <span className="flex items-center gap-2">
                      <Progress value={Math.min(100, fill)} aria-label={`All departments: ${fill}% filled`} className="h-1.5 w-20" />
                      <span className="w-10 text-right text-[13px] tabular-nums">{fill}%</span>
                    </span>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="font-semibold">Recent activity</CardTitle>
            <CardDescription>Latest extra-duty and replacement updates{showLog ? ", plus changes made in this demo" : ""}.</CardDescription>
            {showLog && (
              <CardAction>
                <Link href="/audit" className="text-[13px] font-medium text-primary hover:underline">
                  Audit log
                </Link>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            <Timeline events={activity} empty="No activity yet." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
