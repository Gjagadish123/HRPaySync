"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ROLE_LABEL, useStore } from "@/components/store";
import { Empty, Field, PageHeader, Tag } from "@/components/app-ui";
import { fmtDT } from "@/lib/time";

export function AuditView() {
  const { log, can } = useStore();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...log].reverse().filter((e) => !s || e.summary.toLowerCase().includes(s) || e.by.toLowerCase().includes(s) || e.action.type.includes(s));
  }, [log, q]);

  if (!can("viewAudit")) {
    return (
      <div>
        <PageHeader title="Audit log" />
        <Empty title="Not available for this role">The audit log is visible to client admins and auditors.</Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Audit log"
        description="Every change made in this demo session: who, when and what. Entries are append-only; history in the generated demo data is shown on each record instead."
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Search" className="w-full sm:max-w-sm">
          {(p) => (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input {...p} type="search" className="field pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Worker ID, person or action" />
            </div>
          )}
        </Field>
        {log.length > 0 && (
          <p className="text-[13px] text-muted-foreground" aria-live="polite">
            {q.trim() ? `${rows.length} of ${log.length} entries` : `${log.length} ${log.length === 1 ? "entry" : "entries"}`}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <Empty title={log.length ? "No entries match" : "No changes yet"}>
          {log.length ? "Clear the search." : "Verify a shift, approve extra duty or add a punch, and it appears here."}
        </Empty>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="grid-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted-foreground">{fmtDT(e.at)}</td>
                  <td className="whitespace-nowrap">
                    <span className="block font-medium">{e.by}</span>
                    <span className="block text-[12px] text-muted-foreground">{ROLE_LABEL[e.role]}</span>
                  </td>
                  <td className="whitespace-nowrap">
                    <Tag tone="ink" className="font-normal">{e.action.type}</Tag>
                  </td>
                  <td className="min-w-[240px]">{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
