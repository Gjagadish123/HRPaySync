import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { ExtraDutyView } from "./extra-duty-view";

export const metadata: Metadata = { title: "Extra duty" };

export default function Page() {
  return (
    <Gate>
      <ExtraDutyView />
    </Gate>
  );
}
