"use client";

// The daily list: every shift in a date range with its reconciled punches, filters and bulk verification.
import { CheckCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { scopedSessions } from "@/components/scope";
import { VerificationMark } from "@/components/session-detail";
import { StatusIcon, statusOf } from "@/components/status";
import { useStore } from "@/components/store";
import { Button, Empty, Field, Panel, Tag, useToast } from "@/components/app-ui";
import { Checkbox } from "@/components/ui/checkbox";
import { awaitingVerification, isPresent, type Session } from "@/lib/attendance";
import { fmtDT, fmtDate, fmtDur, monthDays, monthOf } from "@/lib/time";

const STATUS_FILTERS = [
  ["ALL", "All statuses"],
  ["PRESENT_ANY", "Present (any)"],
  ["ON_DUTY", "On duty now"],
  ["ABSENT", "Absent"],
  ["MISSING_OUT", "Missing OUT"],
  ["LATE", "Late arrival"],
  ["EXTENSION", "Worked past shift"],
  ["UNVERIFIED", "Not verified"],
  ["DISPUTED", "Disputed"],
  ["MANUAL", "Manual punch"],
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number][0];

const PAGE = 200;
type Range = "day" | "month" | "all";

export function DailyList({ onOpen }: { onOpen: (assignmentId: string) => void }) {
  const params = useSearchParams();
  const { world, idx, n, viewer, can, dispatch } = useStore();
  const toast = useToast();
  const initialStatus = (STATUS_FILTERS.find(([k]) => k === params.get("status"))?.[0] ?? "ALL") as StatusFilter;
  const [date, setDate] = useState(params.get("date") ?? world.today);
  const rangeParam = params.get("range");
  const [scope, setScope] = useState<Range>(
    rangeParam === "month" || rangeParam === "all" || rangeParam === "day" ? rangeParam : params.get("date") || initialStatus !== "DISPUTED" ? "day" : "all",
  );
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [contractor, setContractor] = useState("");
  const [department, setDepartment] = useState("");
  const [shift, setShift] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  // Any change to the date, range, status, filters or search drops the selection, so a bulk action never
  // reaches rows the filters now hide.
  const filterKey = [date, scope, status, contractor, department, shift, query].join("|");
  const [selectedFor, setSelectedFor] = useState(filterKey);
  if (selectedFor !== filterKey) {
    setSelectedFor(filterKey);
    setSelected(new Set());
  }

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= world.today;
  const dates = useMemo(
    () =>
      scope === "all"
        ? [...idx.byDate.keys()].filter((d) => d <= world.today)
        : !validDate
          ? []
          : scope === "day"
            ? [date]
            : monthDays(monthOf(date)).filter((d) => d <= world.today),
    [validDate, scope, date, world.today, idx],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const deps = new Map(world.deployments.map((d) => [d.id, d]));
    const out: { session: Session; deploymentId: string }[] = [];
    for (const d of dates) {
      for (const r of scopedSessions(world, idx, n, viewer, d)) {
        const s = r.session;
        const dep = deps.get(r.deploymentId)!;
        if (contractor && dep.contractorId !== contractor) continue;
        if (department && dep.departmentId !== department) continue;
        if (shift && s.assignment.shiftId !== shift) continue;
        if (q) {
          const w = n.worker.get(s.assignment.workerId)!;
          if (!w.id.toLowerCase().includes(q) && !w.name.toLowerCase().includes(q) && !w.deviceId.toLowerCase().includes(q)) continue;
        }
        const v = world.verifications[s.assignment.id];
        const keep = (() => {
          switch (status) {
            case "ALL":
              return true;
            case "PRESENT_ANY":
              return isPresent(s);
            case "LATE":
              return s.lateMins > 0;
            case "EXTENSION":
              return s.extensionMins > 0;
            case "UNVERIFIED":
              return awaitingVerification(s, v);
            case "DISPUTED":
              return v?.client === "DISPUTED" && !v.resolved;
            case "MANUAL":
              return s.hasManual;
            default:
              return s.status === status;
          }
        })();
        if (keep) out.push(r);
      }
    }
    return out.sort(
      (a, b) =>
        b.session.assignment.date.localeCompare(a.session.assignment.date) ||
        a.session.assignment.workerId.localeCompare(b.session.assignment.workerId),
    );
  }, [dates, world, idx, n, viewer, contractor, department, shift, query, status]);

  const counts = useMemo(() => {
    const all = rows.map((r) => r.session);
    return {
      present: all.filter(isPresent).length,
      absent: all.filter((s) => s.status === "ABSENT").length,
      missing: all.filter((s) => s.status === "MISSING_OUT").length,
      unverified: all.filter((s) => isPresent(s) && world.verifications[s.assignment.id]?.client !== "VERIFIED").length,
    };
  }, [rows, world.verifications]);

  const canBulk = can("verifyClient") || can("confirmContractor");
  // Completed, worked shifts that are not under an open dispute (a dispute is settled on the shift itself).
  const pickable = (s: Session) => {
    const v = world.verifications[s.assignment.id];
    return isPresent(s) && s.status !== "ON_DUTY" && !(v?.client === "DISPUTED" && !v.resolved);
  };
  const selectable = rows.filter((r) => pickable(r.session));
  // Only what is listed and selectable right now; a bulk action never reaches anything else.
  const keys = selectable.map((r) => r.session.assignment.id).filter((id) => selected.has(id));
  const allSelected = selectable.length > 0 && keys.length === selectable.length;

  function bulk() {
    const res = can("verifyClient")
      ? dispatch({ type: "verify/client", keys, value: "VERIFIED" }, `Verified ${keys.length} attendance records`)
      : dispatch({ type: "verify/contractor", keys, value: "CONFIRMED" }, `Contractor confirmed ${keys.length} attendance records`);
    if (res.ok) {
      toast(`${keys.length} record${keys.length > 1 ? "s" : ""} ${can("verifyClient") ? "verified" : "confirmed"}.`);
      setSelected(new Set());
    } else toast(res.error, "alert");
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const visibleContractors = world.contractors.filter((c) => viewer.role !== "CONTRACTOR_ADMIN" || c.id === viewer.contractorId);
  const depById = new Map(world.deployments.map((d) => [d.id, d]));

  return (
    <div className="flex flex-col gap-4">
      <Panel className="p-4">
        <h2 className="sr-only">Filters</h2>
        <div role="group" aria-label="Filters" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <Field label="Work date" error={validDate ? null : "Pick a date up to today."}>
            {(p) => <input {...p} type="date" className="field" value={date} max={world.today} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label="Range">
            {(p) => (
              <select {...p} className="field" value={scope} onChange={(e) => setScope(e.target.value as Range)}>
                <option value="day">That day</option>
                <option value="month">Whole month to date</option>
                <option value="all">All loaded dates</option>
              </select>
            )}
          </Field>
          <Field label="Status">
            {(p) => (
              <select {...p} className="field" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                {STATUS_FILTERS.map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            )}
          </Field>
          {viewer.role !== "CONTRACTOR_ADMIN" && (
            <Field label="Contractor">
              {(p) => (
                <select {...p} className="field" value={contractor} onChange={(e) => setContractor(e.target.value)}>
                  <option value="">All contractors</option>
                  {visibleContractors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field label="Department">
            {(p) => (
              <select {...p} className="field" value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">All departments</option>
                {world.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Shift">
            {(p) => (
              <select {...p} className="field" value={shift} onChange={(e) => setShift(e.target.value)}>
                <option value="">All shifts</option>
                {world.shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} · {s.start}–{s.end}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Worker">
            {(p) => <input {...p} type="search" className="field" placeholder="Code, name or device ID" value={query} onChange={(e) => setQuery(e.target.value)} />}
          </Field>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          <span className="font-semibold text-foreground">{rows.length}</span> shift{rows.length === 1 ? "" : "s"} · {counts.present} present · {counts.absent} absent · {counts.missing} missing OUT · {counts.unverified} not verified
        </p>
        {canBulk && (
          <Button kind="tape" disabled={keys.length === 0} onClick={bulk}>
            <CheckCheck aria-hidden />
            {can("verifyClient") ? "Verify" : "Confirm"} selected{keys.length ? ` (${keys.length})` : ""}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty title="No shifts match these filters">Try another date, or set Status back to All.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="relative max-h-[70vh] overflow-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  {canBulk && (
                    <th className="w-10">
                      <Checkbox
                        aria-label="Select all completed, undisputed shifts"
                        checked={allSelected}
                        onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.session.assignment.id)))}
                      />
                    </th>
                  )}
                  <th>Worker</th>
                  <th>Deployment</th>
                  <th>Shift</th>
                  <th>IN</th>
                  <th>OUT</th>
                  <th className="num">Net</th>
                  <th className="num">Past shift</th>
                  <th>Status</th>
                  <th>Verified</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map(({ session: s, deploymentId }) => {
                  const w = n.worker.get(s.assignment.workerId)!;
                  const dep = depById.get(deploymentId)!;
                  const id = s.assignment.id;
                  const canPick = pickable(s);
                  const picked = canPick && selected.has(id);
                  return (
                    <tr key={id} className={picked ? "bg-accent/60" : undefined}>
                      {canBulk && (
                        <td>
                          <Checkbox
                            className="mt-0.5"
                            disabled={!canPick}
                            aria-label={`Select ${w.id} on ${s.assignment.date}`}
                            checked={picked}
                            onCheckedChange={() => toggle(id)}
                          />
                        </td>
                      )}
                      <td>
                        <button
                          type="button"
                          className="group rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          onClick={() => onOpen(id)}
                        >
                          <span className="block font-mono text-[12px] text-muted-foreground">{w.id}</span>
                          <span className="font-medium transition-colors ease-out group-hover:text-primary group-hover:underline">{w.name}</span>
                        </button>
                      </td>
                      <td className="max-w-[220px]">
                        <span className="block truncate">{n.contractor.get(dep.contractorId)?.name}</span>
                        <span className="block truncate text-[13px] text-muted-foreground">{n.department.get(dep.departmentId)?.name}</span>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <Tag tone={s.shift.code === "N" ? "night" : s.shift.code === "D" ? "day" : "muted"}>{s.shift.code}</Tag>
                          {scope !== "day" && <span className="text-[13px] text-muted-foreground">{fmtDate(s.assignment.date)}</span>}
                        </span>
                      </td>
                      <td className="font-mono text-[13px] whitespace-nowrap tabular-nums">{fmtDT(s.in)}</td>
                      <td className="font-mono text-[13px] whitespace-nowrap tabular-nums">
                        {s.out ? fmtDT(s.out) : s.status === "ON_DUTY" ? <span className="font-sans font-medium text-primary">On duty</span> : "—"}
                      </td>
                      <td className="num whitespace-nowrap">
                        {s.status === "MISSING_OUT" ? <span className="text-muted-foreground">No OUT punch</span> : s.in ? fmtDur(s.netMins) : "—"}
                      </td>
                      <td className={`num whitespace-nowrap ${s.extensionMins ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                        {s.extensionMins ? `+${fmtDur(s.extensionMins)}` : "—"}
                      </td>
                      <td className="whitespace-nowrap">
                        <StatusIcon status={statusOf(s)} label />
                        {s.lateMins > 0 && <span className="block text-[12px] text-muted-foreground">Late by {fmtDur(s.lateMins)}</span>}
                        {s.hasManual && <span className="block text-[12px] text-muted-foreground">Manual punch</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        {isPresent(s) ? <VerificationMark v={world.verifications[id]} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
              <span className="text-[13px] text-muted-foreground tabular-nums">Showing {limit} of {rows.length}</span>
              <Button size="sm" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
