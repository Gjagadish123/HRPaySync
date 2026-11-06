# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS. The user also asked for premium components in the 21st.dev / shadcn style. Phase 1 is a frontend-only demo: no backend, with deterministic mock data generated in the browser.

## Users

- **Primary:** client plant and HR administrators and client supervisors, working on desktop. Their daily jobs:
  - check how many contract workers actually reported against licensed and approved strength
  - handle extra duty when a replacement doesn't arrive
  - verify attendance
  - export the daily and monthly Excel reports
- **Secondary:**
  - contractor administrators and supervisors, who see only their own workforce
  - accounts and invoice reviewers, who use verified monthly data for contractor invoice checks
  - read-only auditors

## Product Purpose

A standalone Contractor Manpower & Attendance Management System for one factory client. It:
- schedules regular 12-hour day and night shifts
- records additional duty when a replacement is absent or late, counting only the actual extension worked
- keeps raw punches from face devices untouched and reconciled
- produces the client's Daily Consolidated Manpower Summary and Monthly Employee-wise Attendance report in Excel

Success: the client can trust daily headcount and contractor invoices without a manual spreadsheet.

## Positioning

The product is built around the contractor-to-department manpower grid the client already runs in Excel (OCT_2026 workbook). It adds what the spreadsheet can't do:
- shift-aware attendance that spans overnight shifts
- an extra-duty and replacement trail
- verification status on every record

It is attendance and invoice support, not payroll.

## Operating Context

- One client, one site, two face-recognition devices, roughly 300 contract workers (demo defaults; real figures pending).
- Contractor and department combinations from the client workbook:
  - Mayfair Consultancy: Housekeeping
  - SVM: Housekeeping, Loading & Unloading, Erema (Casual), Gardening
  - Pooja Agencies: Packing & Dispatch
  - Jagruti Enterprises: Packing & Dispatch
  - JK Enterprize: Coal Yard
  - Sree Ganesh: Canteen Services
- 12-hour shifts (08:00–20:00 day, 20:00–08:00 night). Overnight duty is common.
- Excel stays the hand-off format for management and accounts.

## Capabilities and Constraints

- In the demo:
  - masters: contractors, departments, workers
  - shift templates and roster
  - attendance with raw punches and manual corrections
  - extra duty and replacement workflows
  - holidays (the only calendar concept; workers are contract staff, so there is no leave or weekly-off module)
  - daily and monthly Excel export
  - role-scoped views
- Deferred: notifications (SMS / WhatsApp / email), mobile attendance, payroll, CLRA statutory registers, billing rates.
- Must not depend on or share a database with HRPaySync or any other HRMS.
- Open client questions (SRS §16): the meaning of "two systems", device models, the daily headcount definition, overnight attribution, whether breaks are inside the 12 hours, and extra-duty approvers.
- Terminology: "manpower-days" and "unique workers" are different measures and must be labelled separately.

## Brand Commitments

- No client brand supplied. The app name is a placeholder, "Client Manpower", held in one config constant until the client name is confirmed.

## Evidence on Hand

- SRS v1.0 (03 Nov 2026), plus the contractor and department list from the OCT_2026 workbook.
- No real worker names, punches, licence strengths or logos. All demo data is generated and must be presented as demo data.

## Product Principles

1. Actual work is a fact. Approval status never erases or edits a recorded punch or extension.
2. Every number must say what it counts (unique workers vs manpower-days, licensed vs approved vs present).
3. Overnight is normal: show date and time together wherever a shift crosses midnight.
4. Exceptions surface first. Shortages, late or absent replacements, and unverified records lead each screen.
5. Contractors see only their own workforce.

## Accessibility & Inclusion

Desktop-first for admins, still usable on tablet and mobile. Meet WCAG AA contrast, support keyboard navigation for all forms and tables, and never use colour alone to convey a status.
