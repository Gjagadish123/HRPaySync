"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { STATUS_TEXT } from "./session-detail";
import { useStore } from "./store";
import { cx } from "./app-ui";
import { canSeeWorker, deploymentOf, scopeDate } from "@/lib/world";

const LIMIT = 8;

/** Find any visible worker from anywhere: "/" or Ctrl+K, arrows to move, Enter to open their record. */
export function QuickFind() {
  const { world, idx, n, viewer } = useStore();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const listId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing = !!t.closest("input, select, textarea, [contenteditable=true]");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing && !t.closest("[role=dialog], [role=menu]"))) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out = [];
    for (const w of world.workers) {
      // Same scoping as the Workers page: a future joiner already belongs to their first contractor.
      if (!canSeeWorker(viewer, w, scopeDate(w, world.today))) continue;
      const hay = `${w.id} ${w.name} ${w.deviceId}`.toLowerCase();
      if (!hay.includes(s)) continue;
      out.push(w);
      if (out.length === LIMIT) break;
    }
    return out;
  }, [q, world.workers, world.today, viewer]);
  const sel = Math.min(cursor, Math.max(0, results.length - 1));

  function close() {
    setOpen(false);
    setQ("");
    setCursor(0);
  }

  function go(id: string) {
    close();
    // Same page: change the hash so the open sheet follows; another page: client navigation keeps the store.
    if (path === "/workers") window.location.hash = encodeURIComponent(id);
    else router.push(`/workers#${encodeURIComponent(id)}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-lg border bg-background pr-1.5 pl-2.5 text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground md:w-56"
        aria-label="Find a worker"
        aria-keyshortcuts="/ Control+K"
      >
        <Search className="size-4" aria-hidden />
        <span className="text-[13px] max-md:hidden">Find worker…</span>
        <Kbd className="ml-auto max-md:hidden">/</Kbd>
      </button>
      {/* A Radix Dialog, so it stacks above an open Sheet (also Radix) instead of fighting it. */}
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="top-[12vh] w-[min(560px,calc(100vw-2rem))] max-w-none translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-none"
        >
        <DialogTitle className="sr-only">Find a worker</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={results[sel] ? `${listId}-${sel}` : undefined}
            aria-label="Worker ID, name or device reference"
            placeholder="Worker ID, name or device ref"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor(Math.min(sel + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor(Math.max(sel - 1, 0));
              } else if (e.key === "Enter" && results[sel]) {
                e.preventDefault();
                go(results[sel].id);
              }
            }}
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Matching workers" className="max-h-[50vh] overflow-y-auto py-1">
          {results.map((w, i) => {
            const dep = deploymentOf(world, w, scopeDate(w, world.today));
            const today = idx.byWorker.get(w.id)?.find((s) => s.assignment.date === world.today);
            return (
              <li
                key={w.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === sel}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(w.id)}
                className={cx("mx-1.5 my-0.5 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2", i === sel && "bg-accent")}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[12px] text-muted-foreground">{w.id}</span>
                  <span className="block truncate font-medium">
                    {w.name}
                    {!w.active && <span className="ml-2 text-[12px] font-normal text-muted-foreground">inactive</span>}
                  </span>
                  <span className="block truncate text-[13px] text-muted-foreground">{dep ? n.deploymentLabel(dep) : "Unassigned"}</span>
                </span>
                <span className="shrink-0 text-right text-[12px] text-muted-foreground">
                  {today ? `${today.shift.code} · ${STATUS_TEXT[today.status]}` : "Not rostered today"}
                </span>
              </li>
            );
          })}
        </ul>
        {q.trim() && results.length === 0 && <p className="px-4 py-6 text-center text-muted-foreground">No worker matches “{q.trim()}”.</p>}
        {!q.trim() && <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Type an ID like SVM-0303, part of a name, or a device reference.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
