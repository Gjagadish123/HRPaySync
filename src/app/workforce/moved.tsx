"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function MovedToWorkers() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/workers${window.location.hash}`);
  }, [router]);
  return (
    <p className="text-muted-foreground">
      Workforce has moved to{" "}
      <Link href="/workers" className="font-medium text-primary underline-offset-4 hover:underline">
        Workers
      </Link>
      .
    </p>
  );
}
