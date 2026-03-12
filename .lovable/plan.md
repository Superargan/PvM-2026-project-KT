

# Totaalplan: SSOT Refactor + Scenario-systeem + Consistente Verwerking

## Audit: Gevonden Inconsistenties

| # | Probleem | Locatie | Impact |
|---|---|---|---|
| 1 | **Select-patroon mist neighborhood fallback** | `AanmeldingenPage`, `ClientenPage`, `WachtlijstPage` gebruiken `areas:waitlist_area_id(name)` zonder `neighborhoods:neighborhood_id(...)` | `resolveAreaId()` en `filterClients()` matchen nooit via fallback |
| 2 | **GroupComposer mist `neighborhoods:neighborhood_id`** | Regel 92 selecteert alleen `schools(...)` | Stap 2 van `resolveAreaId()` faalt |
| 3 | **AvailabilityValidation mist fallback-gebiedsdata** | Regel 39 haalt alleen `areas:waitlist_area_id(name)` op | Gebiedsnaam toont "—" voor clients zonder `waitlist_area_id` |
| 4 | **Query key fragmentatie voor `client_area_preferences`** | PlanningPage: `clientKeys.list("all-preferences")`, WaitlistOverview: `["clients", "waitlist-overview-prefs"]`, GroupComposer: `["clients", "group-composer-prefs"]` | Geen cache-sharing, stale data |
| 5 | **Query key fragmentatie voor `availability_override_logs`** | PlanningPage: `["availability-override-logs"]`, GroupComposer: `["availability-override-logs-active"]` | Geen cache-sharing |
| 6 | **`hasAvailabilityCoverage` default = 3 maanden** | `clientUtils.ts` regel 237 | Discrepantie met 4-maands invulnorm; correctie: default = 3 als **waarschuwingsgrens**, 4 als **invulnorm** — huidige waarde is correct per nieuwe specs |
| 7 | **AvailabilityValidation threshold hardcoded** | Regel 94: `addMonths(now, 3)` | Klopt nu met specs (3 = signaleringsgrens), maar tekst zegt "3 maanden" terwijl het "minder dan 3 maanden" moet zijn |
| 8 | **`getResolvedAreaName` alleen in PlanningPage** | Inline helper, niet centraal | Andere componenten doen ad-hoc gebiedsnaam-resolutie |

## Implementatieplan (8 taken)

### Taak 1: Centrale `CLIENT_AREA_SELECT` + `getResolvedAreaName` in clientUtils.ts

Voeg toe aan `src/lib/clientUtils.ts`:

```text
CLIENT_AREA_SELECT = "id, first_name, last_name, date_of_birth, waitlist_area_id, 
  neighborhood_id, all_areas_flexible, intake_status, school_id, dob_estimated,
  neighborhoods:neighborhood_id(id, area_id, areas(id, name)),
  schools(id, name, neighborhood_id, neighborhoods(id, area_id, areas(id, name)))"

getResolvedAreaName(client, areas?): string
  - waitlist_area_id → lookup in areas array
  - fallback client.neighborhoods?.areas?.name
  - fallback client.schools?.neighborhoods?.areas?.name
  - default "—"
```

### Taak 2: Uniformeer queries in alle pagina's

Pas select-patronen aan naar `CLIENT_AREA_SELECT` (plus eventuele extra velden per component):

| Component | Huidige select | Wijziging |
|---|---|---|
| **AanmeldingenPage** | `*, schools(name), areas:waitlist_area_id(name)` | Voeg `neighborhoods:neighborhood_id(...)` toe, behoud `*` |
| **ClientenPage** | idem | idem |
| **WachtlijstPage** | `..., areas:waitlist_area_id(name)` | Voeg `neighborhoods:neighborhood_id(...)` toe |
| **GroupComposer** | mist `neighborhoods:neighborhood_id(...)` | Voeg toe |
| **AvailabilityValidation** | `..., areas:waitlist_area_id(name)` | Vervang door fallback-keten, gebruik `getResolvedAreaName` |

### Taak 3: Unificeer query keys

In `src/lib/queryKeys.ts`:
- Voeg `clientKeys.areaPreferences` toe → `["clients", "area-preferences"]`
- Voeg `clientKeys.overrideLogs` toe → `["clients", "override-logs"]`
- Voeg `clientKeys.availability` toe → `["clients", "all-availability"]`

Vervang in:
- **WaitlistOverview** regel 38: `["clients", "waitlist-overview-prefs"]` → `clientKeys.areaPreferences`
- **GroupComposer** regel 102: `["clients", "group-composer-prefs"]` → `clientKeys.areaPreferences`
- **PlanningPage** regel 353: `clientKeys.list("all-preferences")` → `clientKeys.areaPreferences`
- **PlanningPage** regel 366: `["availability-override-logs"]` → `clientKeys.overrideLogs`
- **GroupComposer** regel 159: `["availability-override-logs-active"]` → `clientKeys.overrideLogs`

### Taak 4: Beschikbaarheid — invulnorm 4 maanden, signaleringsgrens 3 maanden

In `clientUtils.ts`:
- `hasAvailabilityCoverage(avail, monthsAhead = 3)` — **behouden als 3** (= signaleringsgrens)
- Verduidelijk documentatie: "Waarschuwing als dekking onder 3 maanden"
- `validateScenarioSlot` regel 543-545: message aanpassen naar "Beschikbaarheidsdekking onder 3 maanden"
- In `AvailabilityValidation` regel 94: `addMonths(now, 3)` klopt, tekst aanpassen

In `AvailabilityManager` / `AvailabilityValidation`: refresh-functie vult standaard 122 dagen (4 maanden) vooruit — al correct, geen wijziging nodig.

### Taak 5: Gebiedsnaam-weergave centraliseren

Vervang ad-hoc gebiedsnaam-logica:
- **PlanningPage** regels 309-316 (`getResolvedAreaName`): verplaats naar `clientUtils.ts`
- **AvailabilityValidation** regel 136: `(c as any).areas?.name` → `getResolvedAreaName(c, areas)`
- **WachtlijstPage** regel 52: `areas:waitlist_area_id(name)` → volledige keten + helper

### Taak 6: Database — tabellen, RPCs, triggers, RLS bestaan al

De migratie `20260312143824` bevat reeds alle 3 tabellen, 2 RPCs, triggers en RLS. **Geen nieuwe migratie nodig**.

Validatie dat bestaande migratie voldoet aan specs:
- `simulation_scenarios`: statussen, validatie, audit velden ✓
- `simulation_scenario_slots`: conversievelden, CHECKs ✓  
- `simulation_scenario_members`: UNIQUE constraint ✓
- `save_scenario`: SECURITY INVOKER + `is_backoffice()` check ✓
- `convert_scenario_to_planning`: SECURITY DEFINER + advisory lock + idempotent ✓
- Triggers: `invalidate_scenario_validation` op juiste kolommen ✓
- RLS: backoffice ALL, trainers SELECT ✓

### Taak 7: Scenario-validatie afstemmen op SSOT

In `clientUtils.ts` `validateScenarioSlot`:
- Coverage-check (regel 543) gebruikt al `hasAvailabilityCoverage` met default 3 — correct als signaleringsgrens
- Message aanpassen: "Beschikbaarheidsdekking onder 3 maanden — actualisatie nodig"
- Voeg expliciete check toe: als `intake_status` niet in `["intake_afgerond", "wachtlijst"]` → ongeldig (al aanwezig regel 491-495 ✓)

### Taak 8: Tests bijwerken

In `src/test/singleSourceOfTruth.test.ts`:
- Test `resolveAreaId` met `neighborhoods` fallback pad
- Test `getResolvedAreaName` helper
- Test `hasAvailabilityCoverage` confirmeert default = 3 maanden (signaleringsgrens)
- Test dat `CLIENT_AREA_SELECT` string alle benodigde relaties bevat

---

## Overzicht: Leidende bron per gegeven

| Gegeven | Leidende bron | Centrale helper |
|---|---|---|
| Gebied (primair) | `waitlist_area_id` → `neighborhood_id.area_id` → `school.neighborhood.area_id` | `resolveAreaId()` |
| Gebiedsnaam | Zelfde keten | `getResolvedAreaName()` |
| Reserve-gebieden | `client_area_preferences` | `buildPrefsByClientMap()` |
| Beschikbaarheid | `client_availability` (gepagineerd) | `buildAvailabilityByClient()` |
| Signaleringsgrens | < 3 maanden dekking | `hasAvailabilityCoverage(avail, 3)` |
| Invulnorm | 4 maanden (122 dagen) vooruit | AvailabilityManager refresh |
| Planningsstatus | Combinatie bovenstaande | `getPlannabilityStatus()` |
| Al ingepland | `program_clients` + `programs.archived IS NOT TRUE` | `programClientIds` Set |
| Scenario-validatie | Zelfde helpers | `validateScenarioSlot()` / `validateScenario()` |
| Leeftijdscategorie | `date_of_birth` | `getAgeCategoryPlanning()` |
| Match-type | Gebied + voorkeuren + flexibel | `getMatchType()` |

## Bestanden die worden gewijzigd

1. `src/lib/clientUtils.ts` — `CLIENT_AREA_SELECT`, `getResolvedAreaName`, docs
2. `src/lib/queryKeys.ts` — `clientKeys.areaPreferences`, `.overrideLogs`, `.availability`
3. `src/pages/AanmeldingenPage.tsx` — select + gebiedsnaam
4. `src/pages/ClientenPage.tsx` — select + gebiedsnaam  
5. `src/pages/WachtlijstPage.tsx` — select + gebiedsnaam
6. `src/components/GroupComposer.tsx` — select + query keys
7. `src/components/WaitlistOverview.tsx` — query keys
8. `src/components/AvailabilityValidation.tsx` — select + gebiedsnaam + query keys
9. `src/pages/PlanningPage.tsx` — `getResolvedAreaName` verwijderen (nu centraal), query keys
10. `src/test/singleSourceOfTruth.test.ts` — nieuwe tests

