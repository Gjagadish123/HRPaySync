"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/components/store";
import { Button, Empty, Field, PageHeader, ReadOnlyNote, Tag, cx, useToast } from "@/components/app-ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/time";

export function HolidaysView() {
  const { world, can, dispatch } = useStore();
  const toast = useToast();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const year = world.today.slice(0, 4);
  const list = world.holidays;
  const manage = can("manageHolidays");
  const upcoming = list.filter((h) => h.date >= world.today).length;

  function add(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.date = "Choose a date.";
    else if (list.some((h) => h.date === date)) errs.date = "There is already a holiday on that date.";
    if (name.trim().length < 2) errs.name = "Name the holiday.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const res = dispatch({ type: "holiday/add", holiday: { date, name: name.trim() } }, `Added holiday ${name.trim()} on ${date}`);
    if (!res.ok) return toast(res.error, "alert");
    toast("Holiday added. Adjust the roster for that day if needed.");
    setDate("");
    setName("");
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="Holidays"
        description="Contract workers have no leave module; holidays are the only calendar exception. Reports mark them, and the roster decides who still works."
      />
      {!manage && <ReadOnlyNote>Holidays are maintained by the client admin.</ReadOnlyNote>}
      <Card className="gap-0 py-0 shadow-xs">
        <CardHeader className="border-b py-4">
          <CardTitle role="heading" aria-level={2} className="font-semibold">Holiday calendar</CardTitle>
          <CardDescription className="text-[13px]">
            {list.length} holiday{list.length === 1 ? "" : "s"} · {upcoming} upcoming
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {manage && (
            <form
              onSubmit={add}
              noValidate
              aria-label="Add a holiday"
              className="grid gap-3 border-b bg-muted/40 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-start"
            >
              <Field label="Date" error={errors.date}>{(p) => <input {...p} type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
              <Field label="Name" error={errors.name}>{(p) => <input {...p} className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ugadi" />}</Field>
              <Button kind="tape" type="submit" className="sm:mt-[23px]">Add holiday</Button>
            </form>
          )}
          {list.length === 0 ? (
            <div className="p-4">
              <Empty title="No holidays set">{manage ? "Add the first one above." : "The client admin has not added any yet."}</Empty>
            </div>
          ) : (
            <ul className="divide-y">
              {list.map((h) => {
                const [, day, mon] = fmtDate(h.date).split(" ");
                const past = h.date < world.today;
                const otherYear = h.date.slice(0, 4) !== year;
                return (
                  <li key={h.date} className="flex items-center gap-3 px-4 py-3">
                    <span
                      aria-hidden
                      className={cx(
                        "grid w-12 shrink-0 place-items-center rounded-lg py-1 leading-tight",
                        past ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="text-base font-semibold">{day}</span>
                      <span className="text-[12px]">{mon}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx("block truncate font-medium", past && "text-muted-foreground")}>{h.name}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {fmtDate(h.date)}{otherYear ? ` ${h.date.slice(0, 4)}` : ""}
                      </span>
                    </span>
                    {past && <Tag tone="muted">Past</Tag>}
                    {manage && (
                      <button
                        type="button"
                        aria-label={`Remove ${h.name}`}
                        title={`Remove ${h.name}`}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors ease-out outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50"
                        onClick={() => {
                          const res = dispatch({ type: "holiday/remove", date: h.date }, `Removed holiday ${h.name} on ${h.date}`);
                          toast(res.ok ? `${h.name} removed.` : res.error, res.ok ? "ok" : "alert");
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
