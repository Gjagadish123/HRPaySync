// Adapted from "Stats Card" by ravikatiyar162 on 21st.dev (retrieved with the 21st.dev MCP, 5 Nov 2026):
//   https://21st.dev/@ravikatiyar162/components/stats-card-1
// Changes for this app, with no extra npm dependencies:
//   - Built on the local shadcn Card; colours from the theme tokens (one primary blue).
//   - The whole card is a link to the screen behind the number, with a visible focus ring.
//   - The "+20.1% from last month" trend line is replaced by a free-form detail line, an optional
//     suffix after the value ("/ 155") and an optional progress bar for fill against a target.
//   - The icon sits in a pale-blue chip; numbers are tabular.
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function StatCard({
  title,
  value,
  suffix,
  icon: Icon,
  detail,
  href,
  progress,
  badge,
}: {
  title: string;
  value: ReactNode;
  suffix?: ReactNode;
  icon: LucideIcon;
  detail?: ReactNode;
  href: string;
  /** 0–100; the label is the bar's accessible name. */
  progress?: { value: number; label: string };
  /** Short status shown beside the value, e.g. a Tag. */
  badge?: ReactNode;
}) {
  return (
    <Link href={href} className="group/stat rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className="h-full gap-3 shadow-xs transition-shadow duration-150 ease-out group-hover/stat:shadow-sm group-hover/stat:ring-primary/30">
        <CardHeader>
          <CardTitle className="text-[13px] font-medium text-muted-foreground">{title}</CardTitle>
          <CardAction>
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-4" aria-hidden />
            </span>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</span>
            {suffix && <span className="text-[14px] text-muted-foreground tabular-nums">{suffix}</span>}
            {badge && <span className="ml-auto self-center">{badge}</span>}
          </div>
          {progress && <Progress value={Math.max(0, Math.min(100, progress.value))} aria-label={progress.label} className="h-1.5" />}
          {detail && <p className="mt-auto text-[13px] text-muted-foreground">{detail}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}
