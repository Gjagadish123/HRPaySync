import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { ShiftsView } from "./shifts-view";

export const metadata: Metadata = { title: "Shifts" };

export default function Page() {
  return (
    <Gate>
      <ShiftsView />
    </Gate>
  );
}
