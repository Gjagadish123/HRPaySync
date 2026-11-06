import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { ContractorsView } from "./contractors-view";

export const metadata: Metadata = { title: "Contractors" };

export default function Page() {
  return (
    <Gate>
      <ContractorsView />
    </Gate>
  );
}
