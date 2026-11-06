import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { ReportsView } from "./reports-view";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <Gate>
      <ReportsView />
    </Gate>
  );
}
