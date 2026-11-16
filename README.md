# Masjid Manager

A separate, bilingual Urdu/English masjid operations app built with React, TypeScript, Vite, MUI, TanStack Query, and Supabase. It covers staff, rental properties and leases, rent receipts, utility bills, maintenance, the finance ledger, donations, prayer schedules and attendance, worshippers, programs, bookings, announcements, and a private legal-matter register with editable draft templates.

This app uses a **separate Supabase project**. It does not connect to or modify the HRMS project or its `.env.local`.

Operational records are scoped to a registered mosque, including staff, tenants, rental properties and leases, attendance, finance, banking, programs, legal matters, announcements, and member accounts. The workspace mosque selector controls forms, lists, and dashboard summaries; database policies and relationship constraints enforce mosque access and prevent linking records across mosques. A staff member or worshipper has one mosque record.

## Local setup

1. Create a Supabase project for Masjid Manager.
2. In this directory, copy `.env.example` to `.env.local` and set:
   - `VITE_SUPABASE_URL`: the new project URL.
   - `VITE_SUPABASE_ANON_KEY`: its publishable/anon key. Never use a service-role or secret key in this browser app.
   - `VITE_CURRENCY`: an ISO 4217 currency code, default `PKR`.
3. In that project's Supabase SQL Editor, run migrations in order:
   - `supabase/migrations/20261019000000_masjid_management.sql`
   - `supabase/migrations/20261103000000_staff_and_rental_details.sql`
   - `supabase/migrations/20261104000000_staff_benefits_and_pension.sql`
   - `supabase/migrations/20261105000000_secure_member_accounts_and_committee.sql`
   - `supabase/migrations/20261106000000_legal_matters_register.sql`
   - `supabase/migrations/20261107000000_masjid_bank_accounts_and_reconciliation.sql`
   - `supabase/migrations/20261108000000_mosque_registry_and_pakistan_admin_areas.sql`
   - `supabase/migrations/20261109000000_mosque_committee_management.sql`
   - `supabase/migrations/20261109170000_mosque_committee_pledges.sql`
   - `supabase/migrations/20261110120000_committee_member_history.sql`
   - `supabase/migrations/20261111120000_mosque_scoping_and_staff_interviews.sql`
   
   The last migration backfills unassigned legacy records only when exactly one mosque is registered. If multiple mosques are already registered, select the correct target by adding `set local app.masjid_id = '<registered-mosque-uuid>';` immediately after `begin;` in that migration before running it. It preserves records that already have a mosque link, associates an assigned imam with that mosque, and stops on duplicate imam assignments or incompatible parent relationships instead of guessing. Do not rerun earlier migrations.
4. Create the first user in Supabase Authentication. Promote only that trusted account to administrator by running the following in the project's SQL Editor, replacing the email:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   where email = 'admin@example.com';
   ```

   The update must affect exactly one account. Sign out and back in to refresh the access token. Roles are trusted `app_metadata` claims and must only be assigned by a project administrator using the Supabase dashboard or a trusted server. Supported roles: `admin`, `mosque_manager`, `accountant`, `property_manager`, `imam`, `committee`, `tenant`, and `worshipper`.
5. Install and start:

   ```powershell
   npm install
   npm run dev
   ```

`supabase/seed.sql` contains fictional development records. Run it only after migrations and after registering exactly one mosque, or set `app.masjid_id` at the start of the seed script to choose the target.

## GitHub Pages deployment

The repository's GitHub Actions workflow builds this app from `masjid-manager/` and deploys it to GitHub Pages whenever a commit is pushed to `main`. Before the first deployment:

1. In the GitHub repository, open **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
2. Under **Settings → Secrets and variables → Actions**, add the repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Use the Masjid Manager project's URL and its publishable/anon key only; never use a service-role or secret key in this browser app.
3. Optionally add the repository variable `VITE_CURRENCY` (defaults to `PKR`).
4. In the Masjid Manager Supabase project, set **Authentication → URL Configuration → Site URL** to `https://task12112526-prog.github.io/HRMS/` and allow that URL for redirects so email invitations return to the deployed app.
5. Push a commit to `main`, or start **Deploy Masjid Manager to GitHub Pages** from the repository's **Actions** tab.

The workflow sets the repository subpath for GitHub Pages and publishes a `404.html` fallback so client-side routes continue to load. Local and Vercel builds keep the default `/` base path. The deployed URL appears in the workflow's deployment environment.

Accounts can be created/invited in Supabase Authentication. Member invitations are associated with the selected mosque; the created worshipper profile receives the same mosque link. Tenant accounts still require linking their Auth user ID to the matching `tenants.user_id` record. Non-manager users can only access the mosque associated with their linked member, staff, tenant, or worshipper record. Do not expose another tenant's identity or records.

### Inviting Imam, committee and worshipper accounts

The administrator-only **Member accounts** page assigns display numbers `USER-001` through `USER-009` and sends a Supabase Auth email invitation for the selected mosque. The number is not a login name: invited users sign in with their email and choose their own password using the secure invitation link. No passwords are generated or stored by the app. The form does not allow assigning administrator, finance, staff or property roles. A worshipper invitation also creates and links a basic worshipper profile; it does not opt the person into email or phone contact. Imam and committee login accounts are separate from staff/payroll profiles.

The **Staff interviews** page records a staff member's education level/details, optional CNIC, panel members, answers to six consistent job-related questions, an assessment score, recommendation, and interview history. CNIC is normalized to 13 digits and is not shown in the staff list; collect it only when needed and limit access to authorized managers.

The `committee` role can manage prayer schedules, worshipper records, prayer attendance, programs, registrations and announcements. It has no RLS access to finance, staff/salary, tenants, rental properties or leases. The browser never receives the Supabase service-role key; the Edge Function checks the caller's trusted admin claim before using that key.

The **Legal matters** section is limited to `admin` and `mosque_manager` by both the UI and database RLS. It tracks masjid/committee, shop/tenant and employee matters, references, summaries, statuses, lawyer contact and deadlines. Its downloadable notice/letter templates are editable plain-text drafts; they are not legal forms, contracts or legal advice. This module does not verify laws, calculate limitation periods or accept document uploads. A qualified local lawyer should review facts and documents before a notice is sent, an employee action is taken, or a deadline is relied on. Legal records are sensitive; do not enter unnecessary identity or private details.

The **Bank accounts** section provides a central grouping/overview with separate masjid bank accounts beneath it, deposit/withdrawal ledgers, cheque status tracking, internal transfer records and statement reconciliation. Access is limited to Admin, Masjid Manager and Accountant by database RLS. Store only the bank name, branch and last four account digits; never store complete account numbers or banking credentials. Statement import supports CSV (including Excel files saved as CSV UTF-8) and manual statement lines. CSV rows require dates, descriptions and signed amounts (positive deposits, negative withdrawals); separate Debit/Credit columns are accepted. Matching checks account, date and signed amount, and a reconciliation is completed only when all lines match and the statement balances. Transfers only add paired ledger entries; they do not move money at a bank. Opening balances and imported statements should be checked against original bank records.

The **Mosque registry** stores registration details, administrative location, assigned imam (linked to an active Imam record in Staff), land and built-up area (with units), contact information, and counts/condition/notes for prayer halls, wudu areas, washrooms, cameras, residential rooms, classrooms, offices, parking and other facilities. Access is limited to Admin and Masjid Manager by database RLS. Its hierarchy supports Country → Province/Territory → Division → District → Tehsil → Town/City → Union Council. The migration preloads Pakistan and its four provinces plus Islamabad, Gilgit-Baltistan and Azad Jammu and Kashmir as starter records; lower-level boundary records are not a complete official nationwide gazetteer and must be added from a verified source before nationwide reporting. Add areas one at a time or import a CSV (maximum 5 MB / 20,000 rows) with columns `level,name_en,name_ur,parent_level,parent_path,code,source_note`. `parent_path` is the full English path (for example `Pakistan / Punjab / Lahore Division`); parents are inserted before their descendants. Confirm the dataset's source and current boundaries before relying on nationwide reports. The local demo includes an explicitly fictional linked example (Madina Masjid, Korangi, and Rashid Ali) to show how the relationship appears.

The **Masjid committees** section links each committee term to a registered masjid. To register people, open the committee's **Manage roster** and choose **Add candidate / member**; record an interview using that candidate's row action before marking them appointed. The interview form records at least two panel members and asks every candidate the same seven suggested questions: relevant community/committee experience; transparent record-keeping and conflicts of interest; representing different community members; resolving disagreements fairly; availability/responsibilities; supporting the mosque's mission, following approved policy and raising disagreements appropriately; and planning, tracking and completing assigned work on time. It also stores answers, an assessment and a recommendation. Committee terms support one supervisor, 5–7 appointed members, contact/address details, optional CNIC, term dates, department responsibilities and internal authority labels. The committee history search matches full CNIC (digits, optional hyphens), phone or name and lists every matching service term; CNIC is masked in result and roster displays. CNIC is sensitive personal data: collect it only when operationally necessary, restrict access to Admin/Masjid Manager, and do not export or share it unnecessarily. A renewal carries a recorded CNIC to the new candidate record. Performance reviews are append-only and capture the review period, rating, completed and pending work, achievements, follow-up notes and reviewer. Activation is enforced by PostgreSQL: the term must include today, each active person must have a suitable/conditional interview, and the active roster must contain exactly one supervisor and 5–7 members. Renewal creates a draft for the next term and copies the prior active roster as candidates; members must be interviewed and appointed again. The former committee remains active until the replacement is activated, at which point its term ends the day before the new term. Committee interview and performance records are read-only after creation and committee history is not hard-deleted. Active members can have a voluntary pledge prepared, printed, and recorded with its exact text, affirmation date and witness names; pledge records are read-only and available to Admin/Masjid Manager only. The draft covers honest community service, integrity, privacy, conflict disclosure, authority limits, and completing/handing over assigned work. It is not legal advice or a substitute for the mosque constitution; review it locally and do not require a religious oath without the member's consent and appropriate advice. Responsibility and authority labels are an internal register only; they do not grant application access or bank-signing authority. Local demo people and interviews are fictional and remain in browser storage.

After applying all ten migrations, deploy the Edge Function from this directory using the Supabase CLI:

```powershell
supabase login
supabase link --project-ref YOUR_MASJID_PROJECT_REF
supabase functions deploy manage-masjid-members
```

Set the project URL and Auth redirect URL in Supabase **Authentication → URL Configuration** (the redirect should be the deployed app's login page). The function uses Supabase's server-side `SUPABASE_SERVICE_ROLE_KEY`, which is available to hosted Edge Functions and must never be copied into `.env.local`, Vercel, or frontend code. If deploying to a non-Supabase Edge Functions runtime, configure `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as server-side secrets. Do not run these commands against the HRMS project.

## Database and access control

The migration creates the schema, trigram search indexes, financial ledger synchronization triggers, occupancy synchronization, the dashboard summary RPC, and RLS policies. It grants browser access only to `authenticated`; each table policy checks trusted role claims or the user's own linked records. Financial transactions generated from donations, rent payments, and paid utilities are synchronized by database triggers and cannot be edited/deleted as manual ledger rows.

Prayer times are entered by masjid personnel; the app does not assume an external prayer-time service. Individual attendance rows are restricted to authorized community managers and the linked worshipper. Use aggregate counts when individual identity is unnecessary.

The generic list pages use Supabase range pagination, exact counts, server-side search, and sorting. They fetch only the current page. The dashboard fetches its aggregates through a single database RPC rather than downloading entire tables.

Staff profiles can store an employee pension deduction percentage and fixed monthly medical, housing, transport, and custom benefits. Salary-payment records calculate pension withheld, benefits added, and take-home pay from the profile values at payment time. The staff benefits page estimates gratuity as one current monthly base salary per completed service year for eligible staff. This is an estimate based on the configured policy, not a legal or contractual determination.

### Browser-only local demo

Use **Load local demo** in the app header to generate 100 fictional records across staff, properties, tenants, leases, rent, finance, prayer, and community modules. These records and any edits are saved only in that browser's local storage; this mode bypasses database reads and writes and does not change Supabase. Use **Exit demo** to return to the connected database. Reloading the demo button generates a fresh sample set.

### Development sample data

`supabase/seed.sql` contains fictional staff (Imam, Muezzin, caretaker and teacher) with sample pension and benefit settings, shopkeepers, residents, active leases, rent receipts, salary payments, utility bills, donations, attendance, prayer times and programs. Run it only in a development project after all ten migrations; it is safe to rerun and skips its existing demo records. Do not run it in a production database.

## Build and deployment

```powershell
npm run typecheck
npm run build
npm run preview
```

For Vercel, import the repository and set **Root Directory** to `masjid-manager`. Use `npm install` as the install command, `npm run build` as the build command, and `dist` as the output directory. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and (optionally) `VITE_CURRENCY` in Vercel's project environment variables, then redeploy. Add the deployed origin to Supabase Auth's Site URL and Redirect URLs. `vercel.json` provides the SPA route fallback.

In-app announcements are available. Browser push notifications, service-worker delivery, and VAPID/Edge Function integration are not included. The `user_notifications` table is ready for a trusted notification service, but the client currently has no notification inbox or push subscription UI.
