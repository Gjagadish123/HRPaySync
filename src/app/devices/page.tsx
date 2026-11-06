import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { DevicesView } from "./devices-view";

export const metadata: Metadata = { title: "Devices" };

export default function Page() {
  return (
    <Gate>
      <DevicesView />
    </Gate>
  );
}
