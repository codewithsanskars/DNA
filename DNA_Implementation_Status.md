# D.N.A. — Implementation Status & Client / Admin Split

Companion to `DNA_Replacement_Checklist.md`. Records what the **Recruiter Workflow** slice built (October 2026), re-checks the checklist against the code, and states **who each feature is for**.

Status key: ✅ built · 🟡 partial · ❌ not built · ⏭ deliberately deferred

**Roles.** The portal keeps exactly two roles (decided October 2026):
- **Admin** = SWFS staff: recruiters, account managers, leadership.
- **Client** = a client organization's users, scoped to their own organization.

Checklist item F-9 (Recruiter / Manager / Sales / Finance sub-roles) is deferred. Every feature below therefore has an explicit Admin vs Client rule. **The API enforces it; hiding things in the UI alone is not relied on.**

---

## 1. The Client / Admin rule

| Principle | Admin (SWFS) | Client |
|---|---|---|
| Whose data | Every client, every candidate | Only candidates linked to their own roles |
| Internal commercial data: CTC, pay rate, margin, placement pay rate | Sees and edits | **Never returned by the API.** Stripped server-side by `redact.middleware.ts` / `scopePlacement` |
| Internal CRM data: tags, owner, last-contacted, notes and activity log, tasks, saved searches | Full access | **No access.** `/api/workflow/*` returns 403 for clients |
| Hiring decisions on their roles: shortlist, interview, offer, reject | Can act on any role | Can act on their own roles |
| SWFS-only pipeline steps: Applied → Screening, recording a hire or placement, ending a placement | Yes | No. Kanban columns are shown as "SWFS only"; API returns 403 |
| Database operations: search the whole pool, import, bulk edit, delete | Yes | No |
| Export | Every column | Only columns the client can already see |

---

## 2. What was built in this slice

### Candidate profile (B1)

| ID | Capability | Status | Admin | Client |
|---|---|---|---|---|
| RC-01 | Years of experience | ✅ | Edit | View |
| RC-02 | Education (structured: institution, degree, field, years) | ✅ | Edit | View |
| RC-03 | Certifications with issuer and expiry, plus "expires in Nd" / "Expired" flags | ✅ | Edit | View |
| RC-04 | Languages | ✅ | Edit | View |
| RC-05 / RC-06 | Current and expected CTC with currency | ✅ | Edit | **Hidden** |
| RC-07 | Notice period | ✅ (already existed) | Edit | View |
| RC-08 | Available-from date | ✅ | Edit | View |
| RC-09 | Work authorization (10 options) | ✅ | Edit | View |
| RC-10 | Employment history (company, title, dates, current) | 🟡 Stored as structured JSON; not yet linked to company records | Edit | View |
| RC-11 | Source: Portal, LinkedIn, Referral, Job board, Website, Agency, Import, Other | ✅ | Edit | Hidden |
| RC-12 | Tags | ✅ | Edit, bulk-tag, filter | **Hidden** |
| F-8 | Record owner on candidates and roles | ✅ (candidates, roles); ❌ (organizations) | Assign | Sees the role owner as "Your SWFS recruiter" |

> These are **real database columns, not the F-1 metadata engine.** This was a deliberate choice: it ships now and costs nothing later. When F-1 lands, these become seeded system attributes.

### Record operations (B2)

| ID | Capability | Status | Admin | Client |
|---|---|---|---|---|
| RC-14 | Edit a candidate | ✅ (already existed; now includes the extended profile) | Yes | No |
| RC-15 | Archive (existing status) / **permanently delete** a candidate | ✅ | Yes | No |
| RC-17 | Delete a role. Closing via status already existed | ✅ | Delete | Close or edit own roles (unchanged) |
| RC-18 | Edit an organization | ✅ | Yes | No |
| RC-19 | Notes on any record: multiple, authored, timestamped | ✅ Candidates, roles, organizations | Yes | No. Clients keep the existing **Feedback** thread |
| RC-20 | @mentions in notes | 🟡 Shown in My Work and the notification bell; no email notification | Yes | No |

### Search (B3)

| ID | Capability | Status | Admin | Client |
|---|---|---|---|---|
| RC-21 | Candidate database search, server-side and paginated | ✅ Search › **Talent database** | Yes | No |
| RC-22 | Filters: skills, title, current or past company, location, education, experience, max expected CTC, max notice, available-by, work authorization, status, source, tags, owner, role and stage | 🟡 Industry is not filterable yet | Yes | No |
| RC-23 | Boolean search: `AND` / `OR` / `NOT` / `-word` / `"phrase"` / `( )` | ✅ | Yes | No |
| RC-24 | Full-text search of résumé contents | ❌ Needs résumé parsing (RC-29) | — | — |
| RC-25 | Saved searches (per user) | ✅ | Yes | No |
| RC-26 | ⌘K / Ctrl+K / `/` command palette | ✅ | All records and navigation | Own organization's candidates and roles only |
| AT-07 | Shareable URLs that keep filter state (search, board view, candidate tabs) | ✅ | Yes | Yes (board view) |

### Pipeline (B5)

| ID | Capability | Status | Admin | Client |
|---|---|---|---|---|
| RC-43 | **Kanban board per role** (Roles › role › Board), drag to change stage, optimistic update with rollback | ✅ | Any column | Shortlisted, Interview, Offer, Rejected only |
| RC-46 | Rejection reasons (10) plus a note. Shown on the role card and the board | ✅ | Yes | Yes (required when rejecting) |
| RC-47 | **Interview record:** date and time, duration, mode, link or address, panel, notes, status, and an "Add to Google Calendar" link | ✅ | Yes | Yes, own roles |
| RC-48+ | **Structured interview scorecards** (standard template on every role): one per interviewer per round; six criteria scored 1–5 (or skipped) with optional evidence; a 4-level hire recommendation; a summary. The panel shows per-criterion averages and the recommendation split; the comparison page shows each criterion as its own row | ✅ | Score; view all | Score and view on their own roles. A client's scorecard notifies SWFS |
| RC-49 | **Offer record:** compensation, currency, annual or hourly, start date, expiry; accept / decline / withdraw. Each outcome has a pipeline effect | ✅ | Yes | Yes, own roles |
| RC-50 | **Placement record:** start and end dates, bill rate, pay rate, fee, guarantee period; complete or terminate. Recording one marks the candidate Hired and Onboarded | ✅ | Create and manage | View, **without pay rate** |
| RC-51 | Hotlists | 🟡 Tags plus saved searches cover it; no dedicated list object | Yes | No |
| RC-41 | **"Submitted" stage** (between Screening and Shortlisted), with a **Submit to client** action and an optional pitch note | ✅ | Submits from Applied / Screening (button or board) | Sees the note and a **New** badge; can't move candidates into Submitted |
| RC-45 | Submission tracking: sent (who, when), **viewed** (the client's first open of the profile is recorded automatically), shortlisted (stage) | 🟡 No email delivery or open tracking yet | Sees "viewed by client 2h ago" / "not yet viewed" | Viewing is recorded |
| RC-40, RC-42, RC-44 | Editable stages, Sourced / Contacted stages, multiple pipelines | ❌ Need F-1 (stages are still a fixed list) | — | — |

### Work management (B7)

| ID | Capability | Status | Admin | Client |
|---|---|---|---|---|
| RC-70 | Tasks: assignee, due date, priority, status, linked record | ✅ | Yes | No |
| RC-71 | **My Work** page: overdue / today / this week / later, mentions, upcoming interviews | ✅ | Yes | No. Clients get upcoming interviews in the bell |
| RC-72 | Reminders | 🟡 In-app sidebar badge and bell; no email or push | Yes | — |
| RC-73 | Recurring tasks: completing one creates the next | ✅ | Yes | No |
| RC-74 | Logging calls, emails, meetings and follow-ups | ✅ | Yes | No |
| RC-75 | "Last contacted" updated automatically by logged contact; next follow-up taken from open tasks | ✅ | Yes | No |

### Notifications (RC-72, RC-20)

Stored per user, with read/unread state, a bell dropdown and a **Notifications** page (`/notifications`). They're generated by one dispatcher (`services/notification.service.ts`) that hooks into the audit log. Every audited action passes through a rule table, so a new action only needs a rule, not changes to each handler. **Nobody is notified of their own action.**

| Trigger | Admin (SWFS) hears about it | Client hears about it |
|---|---|---|
| Client shortlists, rejects (with reason), selects or moves a candidate | ✅ The role's / candidate's owners, or all staff if nobody owns it | — |
| Client schedules, reschedules, cancels or completes an interview; leaves feedback | ✅ | — |
| Client extends an offer, or marks one accepted / declined | ✅ | — |
| Client opens a submitted candidate | ✅ The recruiter who submitted it, plus owners | — |
| Client opens or edits a role, or attaches a JD | ✅ | — |
| SWFS **submits** a candidate | — | ✅ All users of that client organization |
| SWFS schedules, reschedules or cancels an interview | — | ✅ |
| SWFS extends an offer or records the outcome; candidate selected or hired | — | ✅ |
| SWFS records or ends a placement (no pay rate in the message) | — | ✅ |
| SWFS opens or removes a role for the client | — | ✅ |
| @mention in a note; a task assigned or reassigned to you | ✅ That person only | — |
| Internal SWFS work (notes, tags, imports, bulk edits, CTC) | — | ❌ Never |

Time-based reminders aren't stored; the bell computes them live:
- **Admins:** overdue and due-today tasks.
- **Both roles:** interviews in the next 48 hours (clients see only their own roles).

Email and push delivery: ❌ (in-app only).

### Data operations (B8)

| ID | Capability | Status | Admin | Client |
|---|---|---|---|---|
| RC-76 | **CSV import** with column mapping. Recruit CRM / Bullhorn / LinkedIn header names are recognised automatically | ✅ | Yes | No |
| RC-77 | Excel import | ❌ Installing the Excel parser (SheetJS) was blocked by this environment's permission policy. Workaround: save as CSV | — | — |
| RC-78 | Duplicate preview before import; skip, merge or create | ✅ | Yes | No |
| RC-79 | CSV export | 🟡 Fixed column set per role, not user-selectable | All columns | Visible columns only |
| RC-80 | Live duplicate warning when creating a candidate (email, phone, LinkedIn, name) | ✅ | Yes | — |
| RC-81 | Merge UI | ❌ | — | — |
| RC-82 | Bulk actions: tag, untag, owner, status, link to role, export, delete | ✅ Candidates list and search results | Yes | No |

### Clients and contacts (B9)

| ID | Capability | Status | Admin | Client |
|---|---|---|---|---|
| RC-83 | Contacts as people: phone, LinkedIn, notes; add / edit / remove | ✅ | Yes | No (unchanged; the Organizations page is admin-only) |
| RC-84 | Decision-maker and hiring-manager flags | ✅ | Yes | No |
| RC-91 | Meetings | 🟡 Logged as account activity; not a separate record type | Yes | No |
| RC-89 | Placement-fee tracking | 🟡 Recorded per placement; no revenue reporting yet | Yes | No |
| RC-85 to RC-88, RC-90, RC-92 | Leads, deals, sales pipeline, forecast, contracts / SOWs | ❌ Next slice | Admin-only when built | — |

### Platform / Attio-style UX (Part C)

| ID | Capability | Status |
|---|---|---|
| F-3 | Filter DSL | 🟡 Boolean query language for candidates only |
| F-4 | Pagination | 🟡 Candidate search is paginated; other list endpoints still return everything |
| F-10 | Unified timeline | 🟡 Per-record notes and activity; not yet merged with audit events, email or calendar |
| AT-05 / AT-06 | Saved views | 🟡 Saved candidate searches (private) |
| AT-11 | Board view | 🟡 Stage board only, not "any select attribute" |
| AT-13 / AT-14 | Filter builder, sort | 🟡 Candidate search panel and six sorts |
| AT-31 | Keyboard-first UX | 🟡 ⌘K / `/` palette and arrow keys; no j/k list navigation or inline editing |
| AT-32 | Optimistic updates | 🟡 Kanban only |
| RC-109 | Field-level hiding of compensation and margin | 🟡 Hard-coded per role (not configurable) and enforced in the API |

---

## 3. Corrections to the checklist's baseline

Some items were already further along than the checklist said:
- **RC-14 (edit a candidate):** already existed (`PATCH /api/candidates/:id`), admin only.
- **RC-07 (notice period):** already existed.
- **RC-15 (archive):** already existed, via the Archived global status.
- **RC-17 (close a job):** already existed through the job status (OPEN / CLOSED / ON_HOLD).

---

## 4. Still open — recommended order, with Client / Admin intent

| Next | Items | Admin | Client |
|---|---|---|---|
| 1 | Full-text résumé search (RC-24). Parsing now exists (see §AI); indexing the extracted text is the remaining step | Search | — |
| 2 | **Email**: send from record, templates, Gmail / Outlook sync (RC-52 to RC-57) | Yes | Optionally receive submission emails |
| 3 | **Client visibility rule**: now that the Submitted stage exists (RC-41), decide whether clients should see *only* submitted candidates (today they see every candidate linked to their roles, including Applied / Screening) | — | Product decision needed |
| 4 | F-1 / F-2 metadata engine, then editable stages (RC-40, RC-42, RC-44) | Configure | — |
| 5 | Reporting from placements, offers, interviews and rejection reasons (RC-94 to RC-99) | All reports incl. margin | Time-to-fill, interview-to-offer, offer acceptance, *no margin* |
| 6 | Leads / deals / forecast (RC-85 to RC-90) | Yes | Never |
| 7 | Merge UI (RC-81), Excel import (RC-77, needs the dependency approved), selectable export columns | Yes | — |
| 8 | Sub-roles (F-9) if field-level permissions inside SWFS become necessary | Finance-only margin etc. | — |

---

## 5. Where things live

- **Backend**
  - New modules: `routes/workflow.routes.ts` (notes, tasks, staff, saved searches; admin only) and `routes/pipeline.routes.ts` (interviews, offers, placements).
  - Candidate search, duplicates, bulk and import live in `candidate.repository.ts` / `candidate.service.ts`.
  - Boolean parser: `utils/booleanSearch.ts`.
  - Client redaction: `middleware/redact.middleware.ts`.
  - New tables (created by TypeORM sync in dev): `record_notes`, `tasks`, `interviews`, `offers`, `placements`, `saved_searches`, plus new columns on `candidates`, `jobs`, `applications`, `organization_contacts`.
  - **Production needs a migration**, because synchronize is off there.
- **Frontend**
  - Pages: `MyWorkPage`; the Search page's Talent database tab; the rebuilt `OrganizationDetailPage`.
  - Components: `components/workflow/*`, `components/candidates/{KanbanBoard, ApplicationRecords, ProfileDetails, ProfileFieldsEditor, ImportWizard, BulkActionBar, DuplicateWarning, RejectDialog}`, `components/layout/CommandPalette`.


---

## AI features (November 2026)

Provider: **OpenAI if `OPENAI_API_KEY` is set, otherwise local Ollama** (`OLLAMA_URL`, `OLLAMA_MODEL`). All calls go through `backend/src/services/llm.service.ts`. Endpoints are under `/api/ai/*` and rate-limited to 30 per minute per user. If the provider is down, `/api/ai/status` reports it and the UI hides the AI entry points.

| Feature | Where | Admin | Client |
|---|---|---|---|
| Résumé → profile autofill (RC-29 to RC-32). Fills only empty fields; the user reviews before saving | New-candidate form; Edit candidate | Yes | No |
| Candidate ↔ role fit: score, strengths, gaps, interview questions | Candidate page › AI insights | Any role | Own linked candidates and own roles only (service-enforced) |
| Candidate brief: headline, highlights, things to probe | Candidate page › AI insights | Yes | Yes. **CTC and recruiter notes are never sent to the model for clients** |
| Draft submission note | Submit-to-client dialog | Yes | No |
| AI-ranked matches from the talent pool (keyword pre-filter, then LLM ranks the top 10) | Role › AI matches tab | Yes | No |
| Job description writer / improver (inclusive-language prompt) | Create/Edit role | Yes | Yes |
| Plain-English talent search → structured filters | Search › Talent database | Yes | No |

Guardrails: prompts forbid using protected traits and inventing facts. Model output is schema-sanitized before use. Every "Assess fit" run is audit-logged as `AI_MATCH`.

### Founder requests (November 2026)

| Ask | Decision | What shipped | Admin | Client |
|---|---|---|---|---|
| PDF profiles: candidates and organizations | ✅ Built | Server-rendered with pdfkit (`services/pdf.service.ts`), so redaction can't be bypassed. Candidate: **Client-safe** (default) or **Internal** (CTC, tags, owner, notes, every role), plus an optional "Match to role" section. Org: overview, hiring stats, roles with AI summaries, contacts | Both variants; org PDF for any client | Client-safe only; own roles only; own org only |
| Download the filtered candidate list | 🟡 Already existed on Candidates; **fixed on Talent database** (exported only 25 rows) | "Export all" exports every filtered row, capped at 5,000. Adds JD match %, matched and missing skills columns when a JD filter is on | Yes | Candidates page (existing) |
| AI summary on new openings + matching-candidate count | ✅ Built, redesigned | On create, on edit, or when a JD is attached, one LLM call stores `aiSummary` + `aiRequirements` on the job (keyword fallback if the LLM is down). Counts use the deterministic scorer in `services/match.service.ts`. The dashboard gets a **New openings** card; role details get an **AI summary** card | Summary, requirements, pool match count | Summary and requirements only (the pool is internal) |
| Match % when filtering by a JD | ✅ Built | Talent database › "Match to a role's JD" filter, plus 50/60/75%+ minimum. Results are sorted by match % and show matched and missing skills | Yes | — |
| "AI integrations everywhere" | ⚠️ Not as-is | Too vague; covered by the targeted features above | — | — |

Match % = 55% must-have skill coverage + 20% title similarity + 10% nice-to-have + 10% experience + 5% location, with weights renormalised to what the JD specifies. "Match" = 60%+, "strong" = 80%+. **Prod DB:** the new `jobs.aiSummary/aiRequirements/aiAnalyzedAt` columns need `DB_SYNC=true` once (or a migration).
