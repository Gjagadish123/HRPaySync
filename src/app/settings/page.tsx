import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <Gate>
      <SettingsView />
    </Gate>
  );
}
