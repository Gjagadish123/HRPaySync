import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { RosterView } from "./roster-view";

export const metadata: Metadata = { title: "Roster" };

export default function Page() {
  return (
    <Gate>
      <RosterView />
    </Gate>
  );
}
