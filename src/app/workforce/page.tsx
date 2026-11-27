import type { Metadata } from "next";
import { MovedToWorkers } from "./moved";

export const metadata: Metadata = { title: "Workers" };

// Workforce was split into Workers and Contractors. A static export can't use config redirects, so old links
// (and their #<employee code> hashes) are forwarded in the browser.
export default function Page() {
  return <MovedToWorkers />;
}
