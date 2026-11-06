import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function NotFound() {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-10 bg-accent text-accent-foreground">
          <FileQuestion aria-hidden />
        </EmptyMedia>
        <EmptyTitle>
          <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
        </EmptyTitle>
        <EmptyDescription>This address isn&apos;t part of the app. Start again from the dashboard.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/" className={buttonVariants({ size: "lg", className: "px-3.5" })}>
          Back to Dashboard
        </Link>
      </EmptyContent>
    </Empty>
  );
}
