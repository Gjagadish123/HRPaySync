import type { DateStr, DateTimeStr } from "./types.ts";

// All arithmetic runs on "site minutes": minutes since epoch, treating the site-local wall clock as UTC.
// Overnight shifts therefore stay correct regardless of the viewer's browser time zone.

const pad = (n: number) => String(n).padStart(2, "0");

// ponytail: unbounded memo; fine for one site's few-month demo window, use an LRU if the range grows.
const minCache = new Map<string, number>();
export function toMin(dt: DateTimeStr): number {
  const hit = minCache.get(dt);
  if (hit !== undefined) return hit;
  const v =
    Date.UTC(+dt.slice(0, 4), +dt.slice(5, 7) - 1, +dt.slice(8, 10), +(dt.slice(11, 13) || 0), +(dt.slice(14, 16) || 0)) / 60000;
  minCache.set(dt, v);
  return v;
}

export function fromMin(min: number): DateTimeStr {
  const x = new Date(min * 60000);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}

export const dateOf = (dt: DateTimeStr): DateStr => dt.slice(0, 10);

/** Operational work date: before the cut-over time, the previous date is still running. */
export function workDate(now: DateTimeStr, cutover: string): DateStr {
  return timeOf(now) < cutover ? addDays(dateOf(now), -1) : dateOf(now);
}
export const timeOf = (dt: DateTimeStr): string => dt.slice(11, 16);

export function addDays(date: DateStr, n: number): DateStr {
  return dateOf(fromMin(toMin(date) + n * 1440));
}

export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((toMin(b) - toMin(a)) / 1440);
}

/** Inclusive list of dates. */
export function dateRange(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthDays(ym: string): DateStr[] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return dateRange(`${ym}-01`, `${ym}-${pad(last)}`);
}

export const monthOf = (date: DateStr) => date.slice(0, 7);
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}`;
}

/** Current wall-clock time at the site, independent of the browser's zone. */
export function siteNow(timeZone: string, at: Date = new Date()): DateTimeStr {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Start/end of a shift on a work date; end rolls to the next day when the shift crosses midnight. */
export function shiftWindow(date: DateStr, start: string, end: string): { start: DateTimeStr; end: DateTimeStr } {
  const s = `${date}T${start}`;
  const e = end <= start ? `${addDays(date, 1)}T${end}` : `${date}T${end}`;
  return { start: s, end: e };
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(date: DateStr, withDow = true): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${withDow ? DOW[dow] + " " : ""}${d} ${MON[m - 1]}`;
}

export function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MON[m - 1]} ${y}`;
}

/** "3 Nov 20:00". Always shows the date so overnight times are never ambiguous. */
export function fmtDT(dt: DateTimeStr | null | undefined): string {
  if (!dt) return "—";
  return `${fmtDate(dateOf(dt), false)} ${timeOf(dt)}`;
}

export function fmtDur(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export const weekdayIndex = (date: DateStr) => new Date(toMin(date) * 60000).getUTCDay();
