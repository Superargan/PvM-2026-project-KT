
# Plan: Definitieve implementatie — VOLLEDIG UITGEVOERD

## Status: ✅ Alle stappen voltooid

### Stap 1: Database migraties ✅
- `neighborhood_id` kolom op `clients` + backfill vanuit `schools`
- `admin` enum-waarde toegevoegd aan `app_role`
- `is_admin()` security definer functie
- `availability_override_logs` tabel met unique partial index en RLS

### Stap 2: Centrale helpers ✅
6 pure functies in `src/lib/clientUtils.ts`:
- `buildPrefsByClientMap()` — preference_order-aware
- `buildAvailabilityByClient()` — alleen bruikbare records (start < end)
- `getAvailabilityOverlap()` — beste dag/tijd overlap
- `hasAvailabilityCoverage()` — rolling window check
- `getClientDataCompleteness()` — volledige statusbepaling
- `getPlannabilityStatus()` — 5 statussen

### Stap 3: WaitlistOverview refactoren ✅
- Inline `Set<string>` prefsByClient vervangen door `buildPrefsByClientMap()`
- Reserve-iteratie via `Object.entries(prefs)` i.p.v. `Set.forEach`
- `neighborhood_id` toegevoegd aan query

### Stap 4: GroupComposer refactoren ✅
- `availByClient` met fallback `"09:00"/"17:00"` → `buildAvailabilityByClient()`
- `getSuggestion()` → `getAvailabilityOverlap()`
- Dubbele `prefsByClient` → `buildPrefsByClientMap()`
- Ongebruikte imports (`getDay`, `parseISO` uit date-fns) verwijderd
- `neighborhood_id` toegevoegd aan query

### Stap 5: PlanningPage herontwerp ✅
- Default tab: `"groepen"` (was `"agenda"`)
- Tab volgorde: Groepen | Beschikbaarheid | Agenda
- `allClients` query uitgebreid met `neighborhood_id`, `date_of_birth`, `intake_status`, `school_id`, `schools(name)`
- **5 waarschuwingsknoppen** met mutueel exclusieve tellingen:
  1. "Beschikbaarheid nog doorgeven" — requiresAvailability && !hasAvailability && !isOverridden
  2. "Onbruikbare beschikbaarheid" — has raw records but none usable && !isOverridden
  3. "Beschikbaarheid actualiseren" — onvoldoende 4-maanden dekking && !isOverridden
  4. "Geen gebied" — requiresAvailability && !hasArea && !isOverridden
  5. "Overruled (admin)" — clients met actieve override
- **Admin override UI**: override-knop (alleen admins), verplicht reden-veld, badge met tooltip
- Extra queries: all client_availability, client_area_preferences, availability_override_logs, user_roles admin check

### Stap 6: neighborhood_id sync ✅
- `AanmeldenPublicPage.tsx`: `neighborhood_id` meegestuurd bij registratie
- `ClientDetailPage.tsx`: `neighborhood_id` gesync bij school-wijziging
- `AanmeldingenPage.tsx`: `neighborhood_id` gesync in updateField en handleAssignSchool
- `ClientImport.tsx`: `neighborhood_id` afgeleid bij insert en update

### Stap 7: Queries gelijktrekken ✅
- `WaitlistOverview.tsx`: `neighborhood_id` in select
- `GroupComposer.tsx`: `neighborhood_id` in select
- `PlanningPage.tsx`: `neighborhood_id` in select
- `WachtlijstPage.tsx`: `neighborhood_id` in select
- `AanmeldingenPage.tsx`: gebruikt `*` (bevat automatisch `neighborhood_id`)
- `ClientDetailPage.tsx`: gebruikt `*` (bevat automatisch `neighborhood_id`)

### Stap 8: Opruimen ✅
- Alle tests slagen
- Ongebruikte imports verwijderd
