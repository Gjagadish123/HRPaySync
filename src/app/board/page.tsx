import type { Metadata } from "next";
import { Gate } from "@/components/store";
import { BoardView } from "./board-view";

export const metadata: Metadata = { title: "Shift board" };

export default function Page() {
  return (
    <Gate>
      <BoardView />
    </Gate>
  );
}
