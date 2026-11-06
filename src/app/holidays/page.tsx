import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { HolidaysView } from "./holidays-view";

export const metadata: Metadata = { title: "Holidays" };

export default function Page() {
  return (
    <Gate>
      <HolidaysView />
    </Gate>
  );
}
