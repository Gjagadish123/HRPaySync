import { CircleCheck, OctagonX, TriangleAlert } from "lucide-react";
import type { RuleResult } from "@/lib/compliance";

/** Shows each configured rule with its outcome; a block stops submission, a warning only flags it. */
export function ComplianceList({ results }: { results: RuleResult[] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm" aria-label="Compliance checks">
      {results.map((r) => {
        const blocking = !r.ok && (r.mode === "block" || r.mode === "always");
        const Icon = r.ok ? CircleCheck : blocking ? OctagonX : TriangleAlert;
        return (
          <li key={r.rule} className="flex items-start gap-2.5">
            <Icon size={16} aria-hidden className={`mt-0.5 shrink-0 ${r.ok ? "text-success" : blocking ? "text-destructive" : "text-warning"}`} />
            <span>
              <span className="font-medium">{r.rule}</span>{" "}
              <span className="text-muted-foreground">
                {r.ok ? "OK." : blocking ? "Blocked." : "Warning."} {r.detail}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
