"use client";

import {
  Building2,
  CalendarDays,
  CalendarOff,
  ChevronsUpDown,
  Clock4,
  FileSpreadsheet,
  Fingerprint,
  TimerReset,
  LayoutDashboard,
  LayoutGrid,
  RefreshCw,
  Repeat2,
  ScanFace,
  ScrollText,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { APP_NAME, CLIENT_NAME, SITE } from "@/config";
import type { Permission } from "@/lib/actions";
import { fmtDate, fmtDT } from "@/lib/time";
import type { Viewer } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QuickFind } from "./quick-find";
import { ROLE_LABEL, useMaybeStore, useStore } from "./store";
import { useToast } from "./app-ui";

type NavItem = { href: string; label: string; icon: LucideIcon; needs?: Permission };
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/board", label: "Shift board", icon: LayoutGrid },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/attendance", label: "Attendance", icon: ScanFace },
      { href: "/extra-duty", label: "Extra duty", icon: Clock4 },
      { href: "/replacements", label: "Replacements", icon: Repeat2 },
      { href: "/roster", label: "Roster", icon: CalendarDays },
    ],
  },
  {
    group: "Masters",
    items: [
      { href: "/workers", label: "Workers", icon: Users },
      { href: "/contractors", label: "Contractors", icon: Building2 },
      { href: "/shifts", label: "Shifts", icon: TimerReset },
      { href: "/devices", label: "Devices", icon: Fingerprint },
      { href: "/holidays", label: "Holidays", icon: CalendarOff },
    ],
  },
  {
    group: "Reports & admin",
    items: [
      { href: "/reports", label: "Reports", icon: FileSpreadsheet },
      { href: "/audit", label: "Audit log", icon: ScrollText, needs: "viewAudit" },
      { href: "/settings", label: "Settings", icon: SlidersHorizontal },
    ],
  },
];

function NavGroups() {
  const path = usePathname();
  const store = useMaybeStore();
  const { isMobile, setOpenMobile } = useSidebar();
  const can = (p: Permission) => store?.can(p) ?? false;
  return (
    <>
      {NAV.map(({ group, items }) => (
        <SidebarGroup key={group}>
          <SidebarGroupLabel>{group}</SidebarGroupLabel>
          <SidebarMenu>
            {items
              .filter((i) => !i.needs || can(i.needs))
              .map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? path === "/" : path.startsWith(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={label}>
                      <Link href={href} aria-current={active ? "page" : undefined} onClick={() => isMobile && setOpenMobile(false)}>
                        <Icon aria-hidden />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}

function viewerKey(v: Viewer) {
  return v.role === "CONTRACTOR_ADMIN" ? `CONTRACTOR_ADMIN:${v.contractorId}` : v.role;
}

const ROLE_LINE: Record<Viewer["role"], string> = {
  CLIENT_ADMIN: "Client admin",
  CLIENT_SUPERVISOR: "Client supervisor",
  CONTRACTOR_ADMIN: "Contractor admin",
  ACCOUNTS: "Accounts reviewer",
  AUDITOR: "Auditor, read-only",
};

const initials = (name: string) =>
  name
    .replace(/\(.*\)/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** The demo's stand-in for login: pick whose eyes the app is seen through. */
function ViewerMenu() {
  const { viewer, setViewer, world } = useStore();
  const toast = useToast();
  const current = viewerKey(viewer);
  const choose = (key: string) => {
    const [role, contractorId] = key.split(":");
    const c = world.contractors.find((x) => x.id === contractorId);
    const next: Viewer =
      role === "CONTRACTOR_ADMIN" && c
        ? { role: "CONTRACTOR_ADMIN", name: `${c.name} admin`, contractorId: c.id }
        : role === "CLIENT_SUPERVISOR"
          ? { role: "CLIENT_SUPERVISOR", name: "Shift supervisor" }
          : role === "ACCOUNTS"
            ? { role: "ACCOUNTS", name: "Accounts" }
            : role === "AUDITOR"
              ? { role: "AUDITOR", name: "Auditor" }
              : { role: "CLIENT_ADMIN", name: "Plant HR" };
    setViewer(next);
    toast(`Now viewing as ${next.name}`);
  };
  // Radio items, so assistive tech announces which role is selected.
  const item = (key: string, label: string) => (
    <DropdownMenuRadioItem key={key} value={key}>
      <span className="truncate">{label}</span>
    </DropdownMenuRadioItem>
  );
  const roleLine = ROLE_LINE[viewer.role];
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" aria-label={`Viewing as ${viewer.name}. Change role`}>
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary/10 text-[12px] font-semibold text-primary">{initials(viewer.name)}</AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-[13px] font-medium text-foreground">{viewer.name}</span>
                <span className="truncate text-[12px] text-muted-foreground">{roleLine}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-64">
            <DropdownMenuRadioGroup value={current} onValueChange={(key) => key !== current && choose(key)}>
            <DropdownMenuLabel className="text-[12px] text-muted-foreground">Viewing as (demo login)</DropdownMenuLabel>
            <DropdownMenuGroup>
              {item("CLIENT_ADMIN", ROLE_LABEL.CLIENT_ADMIN)}
              {item("CLIENT_SUPERVISOR", ROLE_LABEL.CLIENT_SUPERVISOR)}
              {item("ACCOUNTS", ROLE_LABEL.ACCOUNTS)}
              {item("AUDITOR", ROLE_LABEL.AUDITOR)}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[12px] text-muted-foreground">Contractor admin</DropdownMenuLabel>
            <DropdownMenuGroup>{world.contractors.map((c) => item(`CONTRACTOR_ADMIN:${c.id}`, c.name))}</DropdownMenuGroup>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function Brand() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link href="/">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
                <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.6" />
                <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.6" />
                <rect x="9" y="9" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.35" />
              </svg>
            </span>
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-[14px] font-semibold text-foreground">{APP_NAME}</span>
              <span className="truncate text-[12px] text-muted-foreground">{SITE.name}</span>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function HeaderStatus() {
  const { world, refresh } = useStore();
  const toast = useToast();
  return (
    <div className="flex min-w-0 items-center gap-2 text-[13px]">
      <span className="font-medium whitespace-nowrap">
        <span className="sr-only">Work date </span>
        {fmtDate(world.today)} {world.today.slice(0, 4)}
      </span>
      <span className="text-muted-foreground whitespace-nowrap max-md:hidden">· Data as of {fmtDT(world.now)} IST</span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          refresh();
          toast("Refreshed to the current time");
        }}
        aria-label="Refresh to current time"
        title="Refresh to current time"
        className="text-muted-foreground"
      >
        <RefreshCw />
      </Button>
    </div>
  );
}

function Banners() {
  const { persistOk, notice, viewer } = useStore();
  const toast = useToast();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (notice && shown.current !== notice) {
      shown.current = notice;
      toast(notice);
    }
  }, [notice, toast]);
  return (
    <>
      {!persistOk && (
        <p role="alert" className="border-b border-destructive/20 bg-destructive/5 px-6 py-2 text-[13px] text-destructive">
          This browser is blocking storage, so changes will be lost on reload.
        </p>
      )}
      {viewer.role === "CONTRACTOR_ADMIN" && (
        <p className="border-b bg-accent/60 px-6 py-2 text-[13px] text-accent-foreground">
          Contractor view: only {viewer.name.replace(/ admin$/, "")} workers and reports are visible.
        </p>
      )}
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const ready = !!useMaybeStore();
  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow-md"
        >
          Skip to content
        </a>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <Brand />
          </SidebarHeader>
          <SidebarContent>
            <nav aria-label="Main">
              <NavGroups />
            </nav>
          </SidebarContent>
          <SidebarFooter>
            <p className="px-2 text-[12px] leading-snug text-muted-foreground group-data-[collapsible=icon]:hidden">
              Demo for {CLIENT_NAME} with synthetic data. No backend is connected.
            </p>
            {ready && <ViewerMenu />}
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
              <SidebarTrigger className="-ml-1 text-muted-foreground" />
              <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
              {ready && <HeaderStatus />}
              <div className="ml-auto flex min-w-0 items-center gap-2">
                {ready && <QuickFind />}
                <Badge variant="secondary" className="bg-accent text-accent-foreground">
                  Demo data
                </Badge>
              </div>
            </div>
            {ready && <Banners />}
          </header>
          <main id="main" className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
