import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { ReplacementsView } from "./replacements-view";

export const metadata: Metadata = { title: "Replacements" };

export default function Page() {
  return (
    <Gate>
      <ReplacementsView />
    </Gate>
  );
}
