"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { SegmentedControl, type SegmentedOption } from "@/components/21st";
import { SessionDetail } from "@/components/session-detail";
import { useStore } from "@/components/store";
import { PageHeader, Sheet, useToast } from "@/components/app-ui";
import { fmtDate } from "@/lib/time";
import { DailyList } from "./daily-list";
import { MonthlyRegister } from "./register";

type View = "register" | "list";
const VIEWS: SegmentedOption<View>[] = [
  { value: "register", label: "Monthly register" },
  { value: "list", label: "Daily list" },
];

export function AttendanceView() {
  const params = useSearchParams();
  const { idx } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  // Links from the dashboard carry date / status / range filters; those belong to the daily list.
  const v = params.get("view");
  const view: View = v === "list" || v === "register" ? v : params.has("date") || params.has("status") || params.has("range") ? "list" : "register";
  const openSession = open ? idx.byAssignment.get(open) : undefined;

  function setView(next: View) {
    const p = new URLSearchParams(params.toString());
    p.set("view", next);
    window.history.replaceState(null, "", `?${p}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Attendance"
        description="Each worker's month at a glance, and every shift with its reconciled punches. Raw device events stay untouched; corrections are added as manual punches with a reason and an approver."
        actions={<SegmentedControl label="Attendance view" options={VIEWS} value={view} onValueChange={setView} />}
      />

      {view === "register" ? <MonthlyRegister onOpen={setOpen} /> : <DailyList onOpen={setOpen} />}

      <Sheet open={!!openSession} onClose={() => setOpen(null)} title={openSession ? `${openSession.shift.code} shift · ${fmtDate(openSession.assignment.date)}` : ""}>
        {openSession && <SessionDetail session={openSession} onMessage={toast} />}
      </Sheet>
    </div>
  );
}
