import { cx } from "@/lib/cx";

const CHIP: Record<string, string> = {
  D: "bg-shift-day text-shift-day-foreground",
  N: "bg-shift-night text-shift-night-foreground",
  G: "bg-shift-general text-shift-general-foreground ring-[1.5px] ring-inset ring-primary",
};
const CHIP_OTHER = "bg-background text-foreground ring-1 ring-inset ring-input";

/** Shift code in its shift tone (D, N and G are steps of the blue, other codes neutral); `prefix` is "+" for extra duty. */
export function ShiftChip({ code, prefix = "", className }: { code: string; prefix?: string; className?: string }) {
  return (
    <span className={cx("grid h-6 min-w-7 place-items-center rounded-md px-1.5 text-[12px] font-semibold", CHIP[code] ?? CHIP_OTHER, className)}>
      {prefix}
      {code}
    </span>
  );
}
