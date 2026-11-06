"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/app-ui";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function ErrorPage({ error, reset }: { error: unknown; reset: () => void }) {
  const message = error instanceof Error && error.message ? error.message : "Something went wrong while showing this page.";
  return (
    <Empty role="alert" className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-10 bg-destructive/10 text-destructive">
          <TriangleAlert aria-hidden />
        </EmptyMedia>
        <EmptyTitle>
          <h1 className="text-xl font-semibold tracking-tight">This screen hit an error</h1>
        </EmptyTitle>
        <EmptyDescription>
          <span className="block font-medium text-foreground">{message}</span>
          Your saved demo changes are safe. Try again, or reset the demo data in Settings if it keeps happening.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        <Button kind="tape" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className={buttonClass("plain")}>
          Back to Dashboard
        </Link>
      </EmptyContent>
    </Empty>
  );
}
