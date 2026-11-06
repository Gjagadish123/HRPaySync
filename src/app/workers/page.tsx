import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { WorkersView } from "./workers-view";

export const metadata: Metadata = { title: "Workers" };

export default function Page() {
  return (
    <Gate>
      <WorkersView />
    </Gate>
  );
}
