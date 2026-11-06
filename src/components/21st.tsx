"use client";
// Components installed from 21st.dev's registry (retrieved with the 21st.dev MCP, 5 Nov 2026):
//   Tabs              https://21st.dev/@haassiib/components/tabs-roving-focus
//   SegmentedControl  https://21st.dev/@klyv-ui/components/segmented-control
//                     adapted from Klyv (https://github.com/Klyv-UI/klyv), MIT, (c) 2026 Klyv contributors
//   Timeline          https://21st.dev/@shadcnui-blocks/components/timeline-05 (Process Timeline)
// Adapted to this design system (DESIGN.md), with no extra npm dependencies:
//   - `cn` -> the local `cx`; slate/indigo/accent classes -> the shadcn theme tokens (one primary blue).
//   - Tabs: the tablist takes an accessible name, and only the active tab points `aria-controls` at the
//     rendered panel (inactive tabs referenced ids that did not exist).
//   - SegmentedControl: a muted track with a raised white thumb on the selected segment; a group-level
//     `disabled` for read-only roles; icon, vertical and bare variants dropped (unused).
//   - Timeline: data-driven instead of hard-coded steps; the rail and markers are kept, the newest event
//     is filled primary and earlier ones are hollow.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { fmtDT } from "@/lib/time";

export type Tab = { id: string; label: ReactNode; disabled?: boolean };

/** Roving tabindex: arrow keys move between tabs, and only the selected tab is a tab stop. */
export function Tabs({
  tabs,
  label,
  value,
  defaultValue,
  onChange,
  className,
  children,
}: {
  tabs: Tab[];
  /** Accessible name for the tab list. */
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  className?: string;
  /** Rendered below the tab strip; the caller owns which panel to show. */
  children?: (activeId: string) => ReactNode;
}) {
  const base = useId();
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.id);
  const active = value ?? internal;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  const onKey = (e: KeyboardEvent) => {
    const usable = tabs.filter((t) => !t.disabled);
    const i = usable.findIndex((t) => t.id === active);
    if (i === -1) return;
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = usable[(i + delta + usable.length) % usable.length];
    select(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div className={cx("flex min-h-0 flex-col", className)}>
      <div role="tablist" aria-label={label} onKeyDown={onKey} className="flex shrink-0 items-center gap-5 overflow-x-auto overflow-y-hidden border-b">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={on}
              aria-controls={on && children ? `${base}-panel` : undefined}
              tabIndex={on ? 0 : -1}
              disabled={t.disabled}
              onClick={() => select(t.id)}
              className={cx(
                "-mb-px border-b-2 px-0.5 pt-1 pb-2.5 text-[14px] font-medium whitespace-nowrap transition-colors duration-150 [transition-timing-function:var(--ease-out-quart)] disabled:opacity-40",
                on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {children && (
        <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`} className="min-h-0 flex-1 pt-6">
          {children(active)}
        </div>
      )}
    </div>
  );
}

export type SegmentedOption<T extends string = string> = { value: T; label: string; disabled?: boolean };

/** Single choice from a few options, as a radiogroup with roving arrow-key focus. */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onValueChange,
  label,
  size = "md",
  disabled = false,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible name for the set. */
  label: string;
  size?: "sm" | "md";
  /** Read-only roles see the value but cannot change it. */
  disabled?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (event: KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const total = options.length;
    for (let offset = 1; offset <= total; offset += 1) {
      const next = (index + step * offset + total * offset) % total;
      if (!options[next].disabled) {
        onValueChange(options[next].value);
        refs.current[next]?.focus();
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cx("inline-flex w-fit items-center gap-0.5 rounded-lg bg-muted p-[3px] ring-1 ring-border ring-inset", className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || option.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={cx(
              "inline-flex shrink-0 items-center justify-center rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 [transition-timing-function:var(--ease-out-quart)]",
              "disabled:cursor-not-allowed disabled:opacity-60",
              size === "sm" ? "h-7" : "h-[30px]",
              selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export type TimelineEvent = { at: string; title: ReactNode; by?: string; note?: string };

/** Status history on a rail, oldest first; the newest marker is filled. */
export function Timeline({ events, empty = "No updates yet." }: { events: TimelineEvent[]; empty?: ReactNode }) {
  if (events.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ol className="relative ml-1.5 text-[14px]">
      <span aria-hidden className="absolute top-2 bottom-2 left-0 border-l" />
      {events.map((e, i) => (
        <li key={i} className="relative pb-4 pl-5 last:pb-0">
          <span
            aria-hidden
            className={cx(
              "absolute top-[5px] left-px size-2.5 -translate-x-1/2 rounded-full ring-4 ring-background",
              i === events.length - 1 ? "bg-primary" : "border-2 border-input bg-background",
            )}
          />
          <time dateTime={e.at} className="block text-[12px] text-muted-foreground">
            {fmtDT(e.at)}
          </time>
          <span className="font-medium">{e.title}</span>
          {e.by && <span className="text-muted-foreground"> · {e.by}</span>}
          {e.note && <span className="block text-muted-foreground">{e.note}</span>}
        </li>
      ))}
    </ol>
  );
}
