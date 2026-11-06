import type { Metadata } from "next";
import { Suspense } from "react";
import { Gate } from "@/components/store";
import { AttendanceView } from "./attendance-view";

export const metadata: Metadata = { title: "Attendance" };

export default function Page() {
  return (
    <Gate>
      <Suspense>
        <AttendanceView />
      </Suspense>
    </Gate>
  );
}
