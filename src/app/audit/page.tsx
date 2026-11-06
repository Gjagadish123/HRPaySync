import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { AuditView } from "./audit-view";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return (
    <Gate>
      <AuditView />
    </Gate>
  );
}
