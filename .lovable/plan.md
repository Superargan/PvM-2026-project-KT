# Audit Report — Kanjertraining OS

Read-only audit. No files changed. Findings grouped by area and severity, each with a concrete recommended fix.

---

## 1. SECURITY

### CRITICAL

**1.1 Public sign-up route `/aanmelden` is behind `ProtectedRoute`**
`src/App.tsx` wraps `/aanmelden` with `<ProtectedRoute>`, so anonymous parents cannot reach the public sign-up form. Meanwhile, the database grants `INSERT` on `clients` to `anon` specifically to support this flow. Result: either the form is unreachable by its intended audience, or (if reachable via a signed-in staff account only) the anon INSERT grant is an unused attack surface.
Fix: decide the intent. If the form is truly public, remove `ProtectedRoute` from `/aanmelden`, add rate limiting (see 1.2), and add a honeypot/captcha. If it's staff-only, revoke `GRANT INSERT ON clients TO anon`.

**1.2 No rate limiting on anonymous `clients` INSERT**
With anon INSERT enabled and no captcha/turnstile or edge-function throttle, a bot can flood `clients` with fake minors' data. `AanmeldenPublicPage` calls `supabase.from("clients").insert(...)` directly from the browser using the anon key.
Fix: move the insert behind an edge function (`public-signup`) that (a) validates with zod server-side, (b) rate-limits by IP (e.g., Redis/Upstash or a Postgres counter with a short-lived unique constraint), (c) optionally verifies a Cloudflare Turnstile token, then (d) inserts using the service role. Revoke anon INSERT on `clients` after cutover.

### HIGH

**1.3 `areas` table is world-readable (`anon SELECT` with `qual: true`)**
Only table with an anon SELECT policy. Small leak, but inconsistent and exposes internal region structure without need.
Fix: drop the "Anon read areas" policy; the public sign-up flow can fetch areas through the same edge function used in 1.2.

**1.4 RLS policies on `attendance`, `program_sessions`, `program_staff`, `program_clients` target role `public` instead of `authenticated`**
Functionally safe because inner checks (`is_backoffice()`, `is_trainer_for_program()`) require `auth.uid()`, but `role = public` is a footgun — a future policy edit that removes the inner guard would open access to anon.
Fix: `ALTER POLICY ... TO authenticated` for every policy currently scoped to `public` where the intent is signed-in-only.

**1.5 `audit_log` write policy allows any authenticated user to backfill entries**
`INSERT` policy is `WITH CHECK (auth.uid() = viewed_by)`. A trainer can insert arbitrary "view"/"update" rows for any `client_id`, polluting the AVG audit trail. RLS also does not prevent a trainer from writing audit rows for clients they cannot read.
Fix: restrict inserts to backoffice or add `WITH CHECK (is_backoffice() OR is_trainer_for_client(client_id))`; disallow client-side inserts of `action = 'update'` (only save mutation should write those — move it into a `SECURITY DEFINER` RPC or trigger).

**1.6 Client-side "audit view" write is trivial to spoof**
`ClientDetailPage` inserts an audit row on every mount from the browser. A malicious signed-in user can suppress logging (block the request) or spam it. For AVG-grade audit you need server-side logging.
Fix: create an edge function `log-client-access` that verifies JWT, checks read permission, then inserts via service role. Or better, move view logging into an RPC and revoke direct INSERT on `audit_log` from `authenticated`.

**1.7 Trainer scope on `clients` may be too broad**
Not shown in this audit but implied by `is_trainer_for_client(_client_id)`: verify that the SELECT policy on `clients` requires either `is_backoffice()` or `is_trainer_for_client(clients.id)`. If any policy is `USING (is_trainer())` without the per-client scope, trainers can read every child's PII.
Fix: enforce `is_trainer_for_client(id)` per row in the `clients` SELECT policy; same for `guardian_*` columns.

### MEDIUM

**1.8 Edge functions share a copy-pasted auth block, easy to skip**
All six template/document functions repeat: `getClaims` → service-role role check → work. `create-test-template` was missing the check until recently. High risk of the next new function forgetting it.
Fix: extract `assertBackoffice(req)` into `supabase/functions/_shared/auth.ts` and call it as the first line of every function.

**1.9 `verify_jwt = false` on multiple functions**
`generate-document`, `invite-user`, `build-template`, `create-test-template` set `verify_jwt = false` in `supabase/config.toml`. Auth is enforced in code via `getClaims`, but skipping the platform check means malformed/expired tokens reach app logic and an accidental early `return` before the check would open the function.
Fix: keep `verify_jwt = true` unless there is a specific reason (only `public-signup` from 1.2 needs `false`). Remove the overrides from `config.toml` for all authenticated functions.

**1.10 CORS `Access-Control-Allow-Origin: *` on all edge functions**
Combined with the JWT check this is not exploitable directly, but it removes browser-side defense in depth.
Fix: restrict to the app's origin(s) — read from an `ALLOWED_ORIGINS` env var.

**1.11 No bulk email / WhatsApp / SharePoint edge functions deployed**
Memory references Whapi and Resend integrations, but `supabase/functions/` contains only template/document/invite functions. Either the integrations were removed (dead memory) or they run client-side (leaks API keys).
Fix: confirm intent with the user. If integrations are planned, design them as edge functions with per-user rate limits (e.g., `pg` table `outbound_message_log` with a window check) and role gating.

**1.12 Storage bucket policies not audited here**
All six buckets are private (good), but bucket-level RLS policies were not enumerated in this pass. Signed URLs are used for downloads in `ClientDetailPage`.
Fix: run a follow-up audit of `storage.objects` policies per bucket; verify no anon SELECT, and that trainers can only read files tied to their programs.

**1.13 `handle_new_user` trigger inserts profile without role assignment**
New auth users automatically get a `profiles` row but no `user_roles` row. Any signed-up user (if signup is ever re-enabled) would land in a "no role" limbo — and RLS policies keyed on `is_backoffice()`/`is_trainer()` would silently deny everything. Currently signup is disabled (`disable_signup=true`), so latent.
Fix: keep signup disabled; document that invitations go through `invite-user`. Add a lint test that fails if `disable_signup` becomes `false` without a paired role-assignment path.

### LOW

**1.14 Anon key hardcoded in `src/integrations/supabase/client.ts`** — expected & safe (publishable key), but flag for the reviewer.

**1.15 No content security policy / security headers on the SPA** — Vite SPA served without CSP. Add via hosting layer.

---

## 2. UX / USABILITY

### HIGH

**2.1 Intake flow is a single long form, no step-by-step**
`ClientDetailPage` "Gegevens" + "Intake" tabs contain 25+ fields on one page. High cognitive load, no progress guidance, error surface is diffuse.
Fix: keep the detail page as-is for editing, but add a dedicated 3-step wizard for new intakes (kind → school/gebied → ouder/consent), with per-step validation and a summary. Public `/aanmelden` should also be a 2-step wizard.

**2.2 Public sign-up: single generic error on failure**
`AanmeldenPublicPage` writes any DB error into `errors.first_name` ("Er ging iets mis…"), which is misleading and hides the real cause (duplicate, missing school, RLS reject).
Fix: show a top-level `<Alert variant="destructive">` with a friendly message and log the technical error to Sentry/console; keep field errors for validation.

**2.3 No confirmation on `deleteMutation` in ClientDetailPage beyond the AlertDialog**
The AlertDialog is present (good), but destructive parallel deletes across 5 tables happen without a soft-delete or undo window. AVG-required audit rows are wiped in the same batch, destroying evidence of prior actions on this client.
Fix: switch to soft-delete (`clients.deleted_at`) and cascade-hide via RLS; retain `audit_log` rows keyed by client. Provide a 30-day admin restore.

### MEDIUM

**2.4 Bulk school import — error handling not verified in this pass**
`PlanningImport` / `ClientImport` exist; a follow-up should verify: per-row error surfacing, dry-run mode, partial-commit vs all-or-nothing, and an explicit "X added / Y updated / Z skipped / N invalid" summary consistent with the ImportEngine contract.
Fix: audit `src/lib/ImportEngine.ts` consumers; ensure all imports route through it and emit the standard summary shape.

**2.5 Loading states are inconsistent**
`Index.tsx` recently gained skeletons (per prior turn). Other pages (`ClientenPage`, `ProgrammasPage`, `ScholenPage`, `MedewerkersPage`) likely still show a spinner or blank while `useQuery` loads.
Fix: standardize on `Skeleton` rows in every list table's loading state; extract a shared `<TableSkeleton rows columns />` in `src/components/ui/`.

**2.6 Empty states are ad hoc**
Several tables show `"Geen X gevonden"` as a bare `<td>`. No illustration, no primary action.
Fix: create `<EmptyState title description action />` and use across list pages.

**2.7 Dutch copy is generally consistent but mixes "Deelnemer" and "Cliënt"**
Core memory says Deelnemer in UI, client in DB/URL. Spot-check: `ClientDetailPage` uses "Deelnemer" ✅. Verify all pages, toast messages, and empty states — likely stragglers in `ClientenPage`/`RapportagesPage`.
Fix: grep for `\bcliënt\b|\bClient\b` in `src/**` (excluding URLs, types, DB names) and normalize.

**2.8 Mobile responsiveness of key screens — not verified**
Detail pages use `grid grid-cols-2` for form fields which collapses awkwardly on small screens; tables have no horizontal scroll wrapper.
Fix: audit `md:` breakpoints on all form grids; wrap wide tables in `overflow-x-auto`; test AppLayout sidebar on <768px.

### LOW

**2.9 Toast/error copy is inconsistent** — sometimes "Fout", sometimes "Er ging iets mis". Pick one convention.

**2.10 `useBlocker` uses `window.confirm`** — matches spec, but browser confirm can't be styled and is ignored by some in-app navigations (only route-level). Consider a custom AlertDialog wrapper if you want consistency and coverage of tab-close (add `beforeunload` too).

---

## 3. GENERAL QUALITY

### HIGH

**3.1 `as any` / `any` regressions in `ClientDetailPage.tsx`**
Grepping shows `useState<any>({})` for form, `updateData: any`, `auditLog.map((log: any) => …)`, `saveMutation` payload untyped. Violates project rule "no `any` / `as any` in main app".
Fix: use `TablesUpdate<"clients">` for form/update payload; introduce a typed shape for the audit-log embed (`AuditLogWithProfile`) in `queryShapes.ts`; retype `programs` list rows too.

**3.2 Client-side deletion cascade in `deleteMutation` is fragile**
Five parallel deletes from the browser depend on RLS allowing each; a partial failure leaves orphans (e.g., availability rows) with the client already gone or vice versa. Not transactional.
Fix: move to a `SECURITY DEFINER` RPC `delete_client(p_id)` that runs the cascade in one transaction and returns a summary. Add `ON DELETE CASCADE` at the FK level where semantics allow.

**3.3 Missing pagination on large lists**
`ClientenPage` almost certainly loads all clients into memory; same for `AanmeldingenPage`, `WachtlijstPage`, `ProgrammasPage`. Beyond ~1000 rows Supabase silently caps (per project memory: `.range()` loops for >1000).
Fix: add server-side pagination (page/limit query params + `count: 'exact'`), virtualize very long tables with `@tanstack/react-virtual`, or add "Load more" chunking.

### MEDIUM

**3.4 Silent failures in fire-and-forget writes**
- `ClientDetailPage`'s view-log insert: `.then()` with no error handler.
- `AanmeldenPublicPage`: only surfaces a single generic error.
- `useAuth`: `signOut` swallows errors.
Fix: wire every write to at least a `console.error` + toast; add a global `onError` on `QueryClient` mutations.

**3.5 `queryClient.invalidateQueries({ queryKey: clientKeys.all })` after save is broad**
Invalidates every client-scoped query, including all detail queries. Project rule: avoid broad invalidation.
Fix: invalidate `clientKeys.detail(id)`, `clientKeys.list`, and `auditKeys.forClient(id)` explicitly.

**3.6 Fresh audit-log insert on every mount causes duplicate rows**
`useEffect` deps `[id, session?.user?.id]`; React 18 StrictMode double-invokes effects in dev → two "view" rows per open. In production a quick tab switch also writes multiple rows.
Fix: debounce with a `sessionStorage` sentinel keyed by `client_id + date`, or move to server-side (see 1.6).

**3.7 `NotFound` route is inside RootLayout without `ProtectedRoute`**
Unauthenticated users hitting an unknown URL see a bare NotFound; may be intended, but the site chrome (AppLayout) is not rendered — inconsistent.
Fix: decide on `<NotFound>` treatment (with or without chrome) and align.

### LOW

**3.8 Dead/unused imports** — full sweep not done; suggest running `bunx knip` or `eslint --report-unused-disable-directives` and reviewing.

**3.9 Query defaults are generous** — `staleTime: 60_000`, `gcTime: 300_000`. Fine for most reads; for real-time-ish data (audit log, planning) consider per-query `staleTime: 0`.

**3.10 No global error boundary telemetry** — `AppErrorBoundary` exists but likely only renders a fallback. Wire it to a logger (Sentry/Logtail) so silent crashes surface.

**3.11 Edge-function shared code duplication** — same CORS block, createClient boilerplate, and role check copied across 6 files (see 1.8). Extract to `_shared/`.

---

## Suggested next steps (in order)

1. **Decide the `/aanmelden` intent** (drives 1.1, 1.2, 1.3).
2. **Harden `audit_log`** (1.5, 1.6, 3.6) — AVG-critical.
3. **Extract `_shared` edge-function auth helper** (1.8, 1.9, 1.10, 3.11).
4. **Server-side client deletion RPC + soft-delete** (2.3, 3.2).
5. **Type cleanup in `ClientDetailPage`** (3.1) and broaden to sibling pages.
6. **Pagination + shared loading/empty components** (2.5, 2.6, 3.3).
7. **Follow-up audits**: storage.objects RLS (1.12), import summary consistency (2.4), mobile pass (2.8), Dutch copy grep (2.7).

No code changes have been made. Approve to convert selected items into implementation tasks.
