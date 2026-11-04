# NotABAble

Notes. Data. Done. — ABA practice software built for the session, in the room, on a phone.

**Three promises, in priority order**

1. **The session never breaks.** Every tap is written to the device first (IndexedDB, append-only event log with device-generated UUIDs), then synced. No re-login mid-session. A retry can never double-count.
2. **The note is a by-product of the data.** End the session → the note is drafted from what was collected. "Copy last note's style" and "Draft from today's data" are the two buttons. Five payer requirements must pass before it can be signed.
3. **The BCBA sees the whole caseload in one screen.** Stale targets, mastery flags, co-sign queue, auth burn-down with 60/30-day alerts.

Everything downstream is derived: a co-signed note **becomes** the claim line (DB trigger). Nothing in billing is typed by hand.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind v4)
- Supabase (Postgres + Auth). Schema in `supabase/migrations/`. Row-level security on every PHI table, keyed on the signed-in user's org; audit log on every PHI write; signed notes immutable; `session_events` append-only.
- Offline queue: `src/lib/offline.ts` (idb)
- Note drafting: `src/lib/note-draft.ts` (deterministic template) + `src/app/api/note/draft` (optional model, facts-only prompt)

## Run it

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase URL + anon key
pnpm dev
```

Demo logins on the dev project (fictional data): `bcba@demo.aba` / `rbt@demo.aba`, password `demo-aba-2026`.

## Before any real client data

The dev Supabase project is **not** HIPAA-covered. Before a single real client:

1. Supabase Team plan + HIPAA add-on, signed BAA (or AWS RDS with BAA).
2. Vercel Pro + HIPAA BAA (or equivalent host with BAA).
3. BAA with the AI vendor before enabling `ANTHROPIC_API_KEY` — or leave drafting on the template.
4. MFA enforced for all users; session timeout policy decided; backups verified.
5. Written risk assessment + breach procedure.

## What's here (v0) and what's next (v1)

| Area | v0 (this repo) | v1 |
|---|---|---|
| Session | 4 data types (trial w/ prompt levels, frequency, duration, task analysis), offline event log, GPS stamp, quick notes | Program book cached for fully-offline open; group sessions; telehealth flag |
| Notes | Auto-draft, payer checklist, sign → co-sign → locked; return with reason | Custom templates per payer; AI drafting under BAA |
| Clinical | Program book, trial/frequency graphs, mastery detection, mastery line, phase lines (data model), goal bank by assessment, by-RBT split | Phase-line UI, IOA sessions, duration/TA graphs, maintenance scheduling |
| Caseload | Stale targets, co-sign queue age, auth 60/30-day alerts | Supervision % (BACB 5%), live session view |
| Schedule | Week view, auth-overrun + credential-expiry warnings | Drag/drop, recurring appointments, staff availability |
| Billing | Claim lines from co-signed notes, 15-min units (8-minute rule), CSV export, mark submitted | Clearinghouse API (Claim.MD 837P), 835 posting, denials, private-pay invoicing, modifiers per payer |
| Admin | Roles, credential expirations | Credential documents, timesheets from sessions, caregiver portal |
