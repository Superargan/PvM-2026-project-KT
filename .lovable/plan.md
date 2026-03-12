
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

---

# Plan: Simulatiescenario's — nog te implementeren

## Overzicht

Het scenario-systeem laat backoffice-medewerkers groepssamenstellingen opslaan, valideren en omzetten naar echte planning. De huidige GroupComposer werkt volledig in-memory; dit plan voegt persistentie, validatie en omzetting toe.

## Acceptatiecriteria (preciseringen)

### AC-1: `save_scenario` en lege arrays
- Input wordt genormaliseerd: `NULL` arrays worden behandeld als lege arrays
- Expliciete `IF array_length IS NULL THEN delete-all ELSE delete-not-in-set END IF` logica
- Geen `NOT IN` constructie; alleen `!= ALL()` of volledige delete
- Scenario zonder slots en slots zonder members zijn valide states

### AC-2: Definitie "al ingepland"
- `program_clients` gekoppeld aan `programs.archived IS NOT TRUE` is de **enige** bindende planningsbron
- SQL-commentaar in de migratie bevestigt dit
- Zelfde definitie in TypeScript validatie en in de RPC
- Als er toch nog andere actieve planningsbronnen bestaan, moeten die in validatie en omzetting worden meegenomen

### AC-3: `save_scenario` update-semantiek
- Bij update: transactionele sync verwijdert slots die niet meer in de set zitten (CASCADE ruimt members op)
- Per slot: members die niet meer in de set zitten worden verwijderd
- `validation_status` wordt gereset naar `niet_gevalideerd` via de stale-on-change trigger
- `validation_details` en `last_validated_at` worden genulld door diezelfde trigger
- Geen verouderde slots, members of validatie-resten blijven achter na update

---

## Stap 1: Database migratie

Eén SQL-migratie met 3 tabellen, 2 RPCs, triggers, indexen en RLS.

### Tabellen

**`simulation_scenarios`**
| Kolom | Type | Nullable | Default | Opmerking |
|---|---|---|---|---|
| id | uuid | nee | gen_random_uuid() | PK |
| name | text | nee | — | |
| description | text | ja | — | |
| status | text | nee | 'concept' | CHECK: concept, vastgezet, in_uitwerking, gecontroleerd, gedeeltelijk_omgezet, definitief |
| validation_status | text | nee | 'niet_gevalideerd' | CHECK: geldig, aandacht_vereist, ongeldig, niet_gevalideerd |
| validation_details | jsonb | ja | — | |
| last_validated_at | timestamptz | ja | — | |
| created_by | uuid | nee | — | auth.uid() bij insert |
| updated_by | uuid | ja | — | auth.uid() bij update |
| created_at | timestamptz | nee | now() | |
| updated_at | timestamptz | nee | now() | via update_updated_at_column trigger |

**`simulation_scenario_slots`**
| Kolom | Type | Nullable | Default | Opmerking |
|---|---|---|---|---|
| id | uuid | nee | gen_random_uuid() | PK |
| scenario_id | uuid | nee | — | FK → simulation_scenarios ON DELETE CASCADE |
| area_id | uuid | nee | — | FK → areas |
| age_category | text | ja | — | CHECK: '5-7 jaar', '8-12 jaar' |
| label | text | ja | — | CHECK: A-F |
| mode | text | ja | — | CHECK: 'proposal', 'manual' |
| proposal_idx | int | ja | — | Verplicht bij mode='proposal' |
| day_name | text | ja | — | CHECK: ma, di, wo, do, vr. Verplicht bij mode='manual' |
| start_time | time | ja | — | Verplicht bij mode='manual', start < end |
| end_time | time | ja | — | Verplicht bij mode='manual' |
| confirmed | boolean | nee | false | |
| notes | text | ja | — | |
| conversion_status | text | nee | 'niet_geprobeerd' | CHECK: niet_geprobeerd, gelukt, mislukt |
| converted_program_id | uuid | ja | — | FK → programs |
| converted_at | timestamptz | ja | — | |
| conversion_error | text | ja | — | |

**`simulation_scenario_members`**
| Kolom | Type | Nullable | Default | Opmerking |
|---|---|---|---|---|
| id | uuid | nee | gen_random_uuid() | PK |
| scenario_slot_id | uuid | nee | — | FK → simulation_scenario_slots ON DELETE CASCADE |
| client_id | uuid | nee | — | FK → clients |
| has_override | boolean | nee | false | |
| validation_status | text | ja | — | |
| validation_reasons | text[] | ja | — | |
| notes | text | ja | — | |
| UNIQUE(scenario_slot_id, client_id) | | | | |

### Indexen
- `idx_scenario_slots_scenario(scenario_id)`
- `idx_scenario_members_slot(scenario_slot_id)`
- `idx_scenario_members_client(client_id)`
- `idx_scenario_slots_converted_program(converted_program_id)`

### Stale-on-change trigger

Functie `invalidate_scenario_validation()`:
- Gebruikt `TG_OP` voor veilige NEW/OLD handling
- Op slots: AFTER INSERT OR DELETE OR UPDATE OF area_id, age_category, label, mode, proposal_idx, day_name, start_time, end_time, confirmed, notes (NIET op conversievelden)
- Op members: AFTER INSERT OR UPDATE OR DELETE (alle wijzigingen)
- Reset scenario: `validation_status → 'niet_gevalideerd'`, `last_validated_at → NULL`, `validation_details → NULL`

### RLS
- Backoffice: ALL via `(select public.is_backoffice())` — op alle 3 tabellen
- Trainers: SELECT via `(select public.is_trainer())` — op alle 3 tabellen
- `(select ...)` wrapper voor policy-caching

---

## Stap 2: RPC `save_scenario`

SECURITY INVOKER. Transactionele sync.

### Autorisatie (defense-in-depth)

```sql
-- AUTORISATIE-BESLUIT:
-- Supabase kent geen aparte database-rollen per applicatierol.
-- Alle ingelogde gebruikers delen de 'authenticated' rol.
-- GRANT EXECUTE TO authenticated is daarom de smalst mogelijke
-- database-privilege-instelling.
-- De interne is_backoffice() check is LEIDEND voor autorisatie.
-- De RPC vertrouwt NIET op UI-beperkingen of frontend-logica.

REVOKE EXECUTE ON FUNCTION public.save_scenario FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_scenario FROM anon;
GRANT EXECUTE ON FUNCTION public.save_scenario TO authenticated;

-- Eerste instructie in de function body:
IF NOT public.is_backoffice() THEN
  RAISE EXCEPTION 'Alleen backoffice-medewerkers mogen scenario''s opslaan';
END IF;
```

### Insert vs update
- `p_scenario_id IS NULL` → INSERT met `created_by = auth.uid()`, `updated_by = auth.uid()`
- Anders → UPDATE met `updated_by = auth.uid()`

### Slot-sync (AC-1 + AC-3)

```sql
-- Normaliseer NULL naar lege array
v_slot_ids := COALESCE(p_slot_ids, ARRAY[]::uuid[]);

IF array_length(v_slot_ids, 1) IS NULL THEN
  -- Lege set: verwijder ALLE bestaande slots (CASCADE ruimt members op)
  DELETE FROM public.simulation_scenario_slots
  WHERE scenario_id = v_scenario_id;
ELSE
  -- Verwijder slots die niet meer in de set zitten
  DELETE FROM public.simulation_scenario_slots
  WHERE scenario_id = v_scenario_id
    AND id != ALL(v_slot_ids);
END IF;
```

### Member-sync per slot (AC-1 + AC-3)

```sql
-- Normaliseer NULL naar lege array
v_member_client_ids := COALESCE(p_member_client_ids, ARRAY[]::uuid[]);

IF array_length(v_member_client_ids, 1) IS NULL THEN
  DELETE FROM public.simulation_scenario_members
  WHERE scenario_slot_id = v_slot_id;
ELSE
  DELETE FROM public.simulation_scenario_members
  WHERE scenario_slot_id = v_slot_id
    AND client_id != ALL(v_member_client_ids);
END IF;
```

### Return
- Geeft `v_scenario_id` terug zodat frontend het id kent bij insert

---

## Stap 3: RPC `convert_scenario_to_planning`

SECURITY DEFINER, `SET search_path = ''`, fully qualified namen.

### Autorisatie
Zelfde REVOKE/GRANT patroon + interne `is_backoffice()` check als `save_scenario`.

### Idempotentie
Loop alleen over slots met `confirmed = true AND conversion_status IN ('niet_geprobeerd', 'mislukt')`. Slots met `gelukt` worden nooit opnieuw verwerkt.

### Definitie "al ingepland" (AC-2)

```sql
-- BINDENDE PLANNINGSBRON-DEFINITIE:
-- Een cliënt is bindend ingepland als client_id voorkomt in public.program_clients
-- gekoppeld aan een niet-gearchiveerd programma (public.programs.archived IS NOT TRUE).
-- Dit is de enige bindende planningsbron in het systeem.
-- Als er in de toekomst andere planningsbronnen bijkomen, moeten die hier
-- en in de TypeScript-validatie worden meegenomen.
```

### Per slot (subtransactie via BEGIN...EXCEPTION...END)
- Check client_ids niet al ingepland (conform AC-2 definitie)
- INSERT programs + program_clients
- Bij succes: `conversion_status='gelukt'`, `converted_program_id`, `converted_at`
- Bij fout: `conversion_status='mislukt'`, `conversion_error`

### Advisory lock
`pg_advisory_xact_lock(hashtext(p_scenario_id::text))` — voorkomt race conditions

### Statuslogica
Telt alle bevestigde slots (incl. reeds gelukte): alles gelukt → `definitief`, mix → `gedeeltelijk_omgezet`, geen nieuwe successen → ongewijzigd.

### Return
JSON array met per-slot resultaat.

---

## Stap 4: Validatielogica (`src/lib/clientUtils.ts`)

### `validateScenarioSlot(slot, members, ...)`
- Slot-checks: area_id geldig, age_category, bij manual dag+tijden, bij proposal proposal_idx
- Per member: client bestaat + juiste status, beschikbaarheid op dag/tijd via `buildAvailabilityByClient`, 4-maandsdekking via `hasAvailabilityCoverage`, gebiedsmatch via `getMatchType`, niet in programClientIds (AC-2 definitie), override als has_override
- Return: `{ slotStatus, slotIssues[], memberResults[] }`

### `validateScenario(slots[], ...)`
Aggregeert: ongeldig als ≥1 ongeldig, aandacht als ≥1 aandacht, anders geldig.

---

## Stap 5: Query keys (`src/lib/queryKeys.ts`)

```typescript
export const scenarioKeys = {
  all: ["scenarios"] as const,
  detail: (id: string) => ["scenarios", id] as const,
};
```

---

## Stap 6: Nieuw component `ScenarioOverview.tsx`

Gerenderd in PlanningPage Groepen-tab, boven GroupComposer.

- Query `simulation_scenarios` met slot/member counts
- Tabel: naam, status-badge, validatiestatus-badge (met tooltip), updated_at, slots, members, per-slot conversion status
- Waarschuwing als `validation_status = 'niet_gevalideerd'` of `last_validated_at > 24h`
- Status (workflow) en validatiestatus (geldigheid) altijd beide zichtbaar
- Acties: Openen, Hervalideren, Verwijderen
- Bij openen met actieve lokale simulatie: 3-keuze dialog (opslaan als scenario / verwerpen / annuleren)

---

## Stap 7: Wijzigingen `GroupComposer.tsx`

- Nieuwe props: `activeScenarioId`, `onSaveScenario`, `onClearScenario`
- **Opslaan**: knop in simulatiebanner → dialog (naam, beschrijving, status). Serialiseert `simulatedGroups` + `selectedClients` → slots + members. Roept `save_scenario` RPC aan
- **Laden**: deserialiseert scenario → `simulatedGroups` + `selectedClients` state. Werkstate-bescherming: 3-keuze dialog als er al een actieve simulatie is
- **Dirty state**: vergelijkt huidige state met laatst opgeslagen versie. Badge "Wijzigingen niet opgeslagen" in banner
- **Banner**: "Losse simulatie" vs "Scenario: [naam]" met status + validatiebadge
- **Omzetten**: knop disabled bij `isDirty` + tooltip "Sla eerst op". Bij gecontroleerd/gedeeltelijk_omgezet → verse `validateScenario` op opgeslagen DB-data → geldig=direct, aandacht=bevestiging, ongeldig=geblokkeerd → `convert_scenario_to_planning` RPC → resultaatdialog per slot

---

## Stap 8: Wijzigingen `PlanningPage.tsx`

- `activeScenarioId` state
- `ScenarioOverview` in Groepen-tab boven GroupComposer
- Callbacks doorgeven voor laden/opslaan/wissen

---

## Bestanden

| Bestand | Actie |
|---|---|
| SQL migratie | 3 tabellen, 2 RPCs, triggers, indexen, RLS, REVOKE/GRANT |
| `src/lib/clientUtils.ts` | `validateScenarioSlot`, `validateScenario` |
| `src/lib/queryKeys.ts` | `scenarioKeys` |
| `src/components/ScenarioOverview.tsx` | Nieuw |
| `src/components/GroupComposer.tsx` | Opslaan/laden/dirty/omzetten |
| `src/pages/PlanningPage.tsx` | ScenarioOverview integratie |
