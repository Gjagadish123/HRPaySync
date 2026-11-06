# Contractor Manpower & Attendance: frontend demo

A standalone, frontend-only demo of the Contractor Manpower & Attendance Management System (SRS v1.0, 3 Nov 2026).
**No backend is connected.** All data is synthetic, generated in the browser from the site clock (Asia/Kolkata), for one client with one site, two face devices and about 180 contract workers. Contractors, departments and their licence and approval strengths are taken from the client's own Daily Manpower Summary workbook.

It does not use or share anything with HRPaySync or any other HRMS.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Domain checks: overnight shifts, extension maths, dedupe, reports, Excel output, scoping (Node's built-in runner) |
| `npm run test:e2e` | End-to-end flow tests in a real browser (Playwright, using the installed Microsoft Edge; `PW_CHANNEL=chrome` for Chrome). Builds and serves the app on port 3100, or reuses one already running there. The clock is fixed at 12:00 IST on 5 Nov 2026, so results are the same on any day. |

## Demo walkthrough (about 10 minutes)

1. **Dashboard** (`/`). Today at a glance: present against approved strength, absences and late arrivals, extra duty, open replacements, verification, the month's daily manpower trend, strength by contractor and department, what needs attention, and recent activity.
2. **Shift board** (`/board`). Every worker as a chip in their contractor and department slot, coloured by status: green present, amber late, orange missing OUT, red absent, blue on duty now, grey not started. Lanes show the shift (day and general, night). Filter by status, contractor or search; the **Needs action** queue is stepped with `J`/`K`.
3. **Extra duty**. Three SRS §7 scenarios are pre-loaded relative to today:
   - **A**: the reliever is absent, so the day worker continues to 08:00 the next day (12h extension, closed).
   - **B**: an additional shift on the next date (packing shortage).
   - **C**: the reliever arrives at 23:00 and the outgoing worker leaves at 23:15. Only **3h 15m** counts, not 12h.
   - Also: a request that was rejected but worked anyway. It stays on record as *under review*.
   - Create one with **New extra duty**. The compliance checks run live.
4. **Replacements**. Assign a reliever to the unassigned handover. The status changes to Reported or Late only when the reliever's punch arrives.
5. **Attendance**. The **Monthly register** lists every worker against every day of the month with a status icon (present, late, missing OUT, absent, on duty, not started, week off, holiday) and markers for extra duty, disputes and manual punches, plus monthly totals and an attendance rate. Hover or focus a day to see the shift, IN and OUT, hours, lateness and devices; click it to open the shift. The **Daily list** keeps the per-day view: open a shift to see raw versus reconciled punches, add a missed punch (it needs a reason and an approver), or verify and dispute.
6. **Masters**:
   - **Workers**: add a worker with a proposed employee code (editable), their **Device ID** (the enrolment number already on the face device, which is how punches are matched to them), personal and statutory details (only the last four characters of an ID proof are kept). Edit details, transfer, deactivate.
   - **Contractors**: contact and contract validity (with an expiry warning), licensed and approved strength per department, and a link to each contractor's workers.
   - **Shifts**: create, edit and deactivate shift templates. Timings of a shift that has already been worked are locked, so history never changes.
   - **Devices**: add, edit, disable and enable attendance devices, with punches today and in the last 7 days.
   - **Holidays**.
7. **Reports**:
   - Daily Manpower Summary, downloaded in the client's own workbook format, cell for cell: sheet `OCT_2026`, Times New Roman, the merged title, the contractor row with SVM spanning its four departments, the department row, licence and approval rows in red, one row per day with a SUM total, and TOTAL MANPOWER. Two deliberate fixes: the monthly totals include the 31st (the client's sheet stops at row 35), and every column gets a total (the client's sheet leaves SVM's D–F blank).
   - Employee-wise attendance.
   - Invoice support, with manpower-days and unique workers kept separate.
   - All three download as real `.xlsx` files.
8. **Find worker** (`/` or Ctrl+K, from any screen): type an employee code, name or device ID and press Enter to open that worker's record.
9. **Viewing as** (bottom of the sidebar). Switch to a contractor admin to show that they see only their own workers. Switch to Accounts or Auditor for read-only access.
10. **Audit log** and **Settings**: every change is logged, alongside the working-time policy, counting rules and the permission matrix.

Changes are saved in the browser (localStorage) and replayed on reload. **Settings → Reset demo data** starts fresh.

## Structure

```
src/config.ts                 client name, site, work-date cut-over
src/lib/                      pure domain logic (no React): shared with tests
  types.ts  time.ts  seed.ts  attendance.ts  compliance.ts  workflow.ts  reports.ts  actions.ts  excel.ts
src/components/               store (action log + permissions), shell, UI primitives, shared panels
src/app/<route>/              one folder per screen: page.tsx (server) + *-view.tsx (client)
```

Every change is an `Action`, applied by a pure reducer (`lib/actions.ts`). The ordered log serves as the persistence format and the audit trail. When a backend arrives, those actions map one-to-one onto API calls.

## Simulated or not yet decided

- **Placeholder client name**: change `CLIENT_NAME` in `src/config.ts`.
- **Device integration**: punches are generated. "Two systems", device make, model and API are still open (SRS §16).
- **Daily headcount rule**: a worker counts once per shift start date. This is pending client sign-off.
- **Working-time limits** in Settings are demo values. Nothing statutory is hard-coded.
- **Authentication**: the role switcher stands in for login.
- **Deferred by decision**: notifications, mobile attendance, payroll, CLRA registers.
## UI

The interface is built on [shadcn/ui](https://ui.shadcn.com) (Radix, `src/components/ui/`) with a white background and one primary colour, a premium blue; type is Geist. Charts use the shadcn chart component (Recharts). App-level wrappers live in `src/components/app-ui.tsx`.

### Components from 21st.dev

These were installed from 21st.dev's registry and adapted to the theme, with no extra npm dependencies.

| Component | Source | Used for |
|---|---|---|
| Tabs | [haassiib/tabs-roving-focus](https://21st.dev/@haassiib/components/tabs-roving-focus) | Reports sections (arrow keys move between tabs) |
| Segmented control | [klyv-ui/segmented-control](https://21st.dev/@klyv-ui/components/segmented-control) (MIT, Klyv contributors) | Extra-duty Open/All filter; Warn / Block / Off beside each policy limit |
| Timeline | [shadcnui-blocks/timeline-05](https://21st.dev/@shadcnui-blocks/components/timeline-05) | Status history on extra-duty and replacement records |

They live in `src/components/21st.tsx`, which notes what was changed from each original.
