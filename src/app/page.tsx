import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <Gate>
      <DashboardView />
    </Gate>
  );
}
