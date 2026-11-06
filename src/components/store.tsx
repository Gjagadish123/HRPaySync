"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SITE } from "@/config";
import { apply, can, permissionFor, type Action, type LogEntry, type Permission, violation } from "@/lib/actions";
import { buildAttendance, type AttendanceIndex } from "@/lib/attendance";
import { generateWorld } from "@/lib/seed";
import { siteNow } from "@/lib/time";
import type { Role, Viewer, World } from "@/lib/types";
import { assignmentOn, names, type Names, scopeDate } from "@/lib/world";
import { Skeleton } from "@/components/ui/skeleton";

// v2: devices, worker profile fields and editable shifts changed the data model, so older saved demo changes are not replayed.
const LOG_KEY = "cm-demo:v2:log";
const VIEWER_KEY = "cm-demo:v2:viewer";

export type Result = { ok: true } | { ok: false; error: string };

interface Store {
  world: World;
  idx: AttendanceIndex;
  n: Names;
  log: LogEntry[];
  viewer: Viewer;
  setViewer: (v: Viewer) => void;
  can: (p: Permission) => boolean;
  dispatch: (action: Action, summary: string) => Result;
  refresh: () => void;
  resetDemo: () => void;
  persistOk: boolean;
  notice: string | null;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside <Gate>, after the demo data has loaded");
  return s;
}

/** Null until the browser has generated the demo data. */
export const useMaybeStore = () => useContext(Ctx);

/** Renders its children once data is ready; the page itself still renders on the server as a skeleton. */
export function Gate({ children }: { children: ReactNode }) {
  return useContext(Ctx) ? <>{children}</> : <BootScreen />;
}

export const ROLE_LABEL: Record<Role, string> = {
  CLIENT_ADMIN: "Plant HR · Client admin",
  CLIENT_SUPERVISOR: "Shift supervisor · Client",
  CONTRACTOR_ADMIN: "Contractor admin",
  ACCOUNTS: "Accounts reviewer",
  AUDITOR: "Auditor · Read-only",
};

const DEFAULT_VIEWER: Viewer = { role: "CLIENT_ADMIN", name: "Plant HR" };

function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** A contractor admin may only act on their own workers. */
function inScope(world: World, viewer: Viewer, action: Action): boolean {
  if (viewer.role !== "CONTRACTOR_ADMIN") return true;
  const own = (workerId: string | null | undefined) => {
    if (!workerId) return true;
    const w = world.workers.find((x) => x.id === workerId);
    // A future joiner belongs to their first contractor before their start date.
    return !!w && assignmentOn(w, scopeDate(w, world.today))?.contractorId === viewer.contractorId;
  };
  const byAssignment = (id: string) => own(world.assignments.find((a) => a.id === id)?.workerId);
  switch (action.type) {
    case "extra/create":
      return own(action.extra.workerId);
    case "repl/create":
      return own(action.replacement.outgoingWorkerId) && own(action.replacement.replacementWorkerId);
    case "repl/assign":
      return own(action.workerId);
    case "repl/status": {
      const r = world.replacements.find((x) => x.id === action.id);
      return !!r && own(r.outgoingWorkerId);
    }
    case "verify/contractor":
      return action.keys.every(byAssignment);
    case "worker/create":
      return action.worker.assignments.every((a) => a.contractorId === viewer.contractorId);
    case "worker/transfer":
      return own(action.workerId) && action.period.contractorId === viewer.contractorId;
    case "worker/active":
    case "worker/update":
      return own(action.workerId);
    default:
      return true;
  }
}

interface Loaded {
  world: World;
  log: LogEntry[];
}

function load(now: string, log: LogEntry[]): Loaded & { dropped: boolean } {
  const base = generateWorld(now);
  try {
    return { world: log.reduce(apply, base), log, dropped: false };
  } catch {
    return { world: base, log: [], dropped: true };
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Loaded | null>(null);
  const [viewer, setViewerState] = useState<Viewer>(DEFAULT_VIEWER);
  const [persistOk, setPersistOk] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const stateRef = useRef<Loaded | null>(null);

  const boot = useCallback(() => {
    try {
      const saved = readJSON<LogEntry[]>(LOG_KEY);
      const log = Array.isArray(saved) ? saved : [];
      const result = load(siteNow(SITE.timeZone), log);
      if (result.dropped) {
        writeJSON(LOG_KEY, []);
        setNotice("Saved demo changes could not be replayed and were cleared.");
      }
      stateRef.current = result;
      setState({ world: result.world, log: result.log });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Unknown error");
    }
  }, []);

  useEffect(() => {
    // Generated on the client from the site clock, so server and client never disagree on "now".
    const v = readJSON<Viewer>(VIEWER_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load of browser-only state
    if (v && v.role && v.name) setViewerState(v);
    boot();
  }, [boot]);

  const setViewer = useCallback((v: Viewer) => {
    setViewerState(v);
    writeJSON(VIEWER_KEY, v);
  }, []);

  const dispatch = useCallback(
    (action: Action, summary: string): Result => {
      const cur = stateRef.current;
      if (!cur) return { ok: false, error: "Data is still loading." };
      if (!can(viewer, permissionFor(action))) return { ok: false, error: `${ROLE_LABEL[viewer.role]} can't do this.` };
      if (!inScope(cur.world, viewer, action)) return { ok: false, error: "That worker belongs to another contractor." };
      const broken = violation(cur.world, action);
      if (broken) return { ok: false, error: broken };
      const now = siteNow(SITE.timeZone);
      const entry: LogEntry = { id: crypto.randomUUID(), at: now, by: viewer.name, role: viewer.role, summary, action };
      let world: World;
      try {
        world = { ...apply(cur.world, entry), now: now > cur.world.now ? now : cur.world.now };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Change could not be applied." };
      }
      const log = [...cur.log, entry];
      const next = { world, log };
      stateRef.current = next;
      setState(next);
      setPersistOk(writeJSON(LOG_KEY, log));
      return { ok: true };
    },
    [viewer],
  );

  const resetDemo = useCallback(() => {
    writeJSON(LOG_KEY, []);
    const result = load(siteNow(SITE.timeZone), []);
    stateRef.current = result;
    setState({ world: result.world, log: [] });
  }, []);

  const world = state?.world;
  const shifts = world?.shifts;
  const punches = world?.punches;
  const assignments = world?.assignments;
  const now = world?.now;
  const policy = world?.policy;
  const idx = useMemo(
    () =>
      shifts && punches && assignments && now && policy
        ? buildAttendance({ shifts, punches, assignments, now, policy })
        : null,
    [shifts, punches, assignments, now, policy],
  );
  const n = useMemo(() => (world ? names(world) : null), [world]);

  const value = useMemo<Store | null>(
    () =>
      state && idx && n
        ? {
            world: state.world,
            idx,
            n,
            log: state.log,
            viewer,
            setViewer,
            can: (p) => can(viewer, p),
            dispatch,
            refresh: boot,
            resetDemo,
            persistOk,
            notice,
          }
        : null,
    [state, idx, n, viewer, setViewer, dispatch, boot, resetDemo, persistOk, notice],
  );

  if (failed) {
    return (
      <div role="alert" className="m-6 max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <p className="font-semibold">The demo data could not be generated.</p>
        <p className="mt-1 text-muted-foreground">{failed}</p>
        <button className="mt-3 font-medium text-primary underline-offset-4 hover:underline" onClick={() => location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Page-shaped placeholder while the demo data is generated in the browser. */
function BootScreen() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-[min(320px,70%)]" />
        <Skeleton className="h-4 w-[min(560px,90%)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
