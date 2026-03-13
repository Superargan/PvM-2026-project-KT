
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

---

# Plan: Sessievensters in voorstellen — ✅ UITGEVOERD (bijgewerkt)

## Wijzigingen

### `src/lib/clientUtils.ts`
- **`AvailabilityProposal`**: uitgebreid met `clientIds: string[]` en `alternativesOnDay: number`
- **Helpertypes toegevoegd**: `NormalizedInterval`, `timeToMinutes()`, `minutesToTime()`
- **`getTopAvailabilityOverlaps`**: werkt met vaste vensters van `minDurationMinutes` (default 90). Per dag wordt het best scorende venster teruggegeven + `alternativesOnDay` telt hoeveel andere geldige vensters er op die dag bestaan.
- **`getAvailabilityOverlap`**: default `minDurationMinutes = 90`

### `src/components/GroupComposer.tsx`
- `getSuggestions` roept `getTopAvailabilityOverlaps(clientIds, availByClient, 3, 90)` aan
- UI toont per voorstel "+N andere momenten op deze dag" wanneer er alternatieven zijn

## Garanties
- Elk voorstel duurt exact `minDurationMinutes` (90 min)
- Voorstellen zoals `15:00–15:00` kunnen niet meer ontstaan
- Per dag maximaal 1 voorstel in de top-3, met indicator hoeveel alternatieven er zijn
- Losse intervallen worden niet samengevoegd
- `clientIds` en `alternativesOnDay` zijn verplicht in elke `AvailabilityProposal`

---

# Plan: Trainingslocaties als tweede locatiebron — NOG TE IMPLEMENTEREN

## Doel

Scholen blijven intact als bestaande bron. Daarnaast komt een aparte `training_locations` tabel. Beide bronnen worden via één centrale abstractielaag gelijkwaardig behandeld in planning, scenario's, validatie en rapportage.

## Fase 1: Database

### 1.1 Nieuwe tabel `training_locations`

```sql
CREATE TABLE public.training_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  postal_code text,
  city text,
  neighborhood_id uuid REFERENCES public.neighborhoods(id),
  area_id uuid REFERENCES public.areas(id),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger voor updated_at
CREATE TRIGGER update_training_locations_updated_at
  BEFORE UPDATE ON public.training_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.training_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backoffice manages training_locations" ON public.training_locations
  FOR ALL TO authenticated
  USING (is_backoffice()) WITH CHECK (is_backoffice());

CREATE POLICY "Trainers read training_locations" ON public.training_locations
  FOR SELECT TO authenticated
  USING (is_trainer());
```

### 1.2 Kolom toevoegen aan `programs`

```sql
ALTER TABLE public.programs
  ADD COLUMN training_location_id uuid REFERENCES public.training_locations(id);
```

`programs` heeft dan:
- `school_id` (bestaand) — locatie is een school
- `training_location_id` (nieuw) — locatie is een trainingslocatie
- `location` (bestaand, text) — vrije tekst, blijft als fallback

Regels:
- Maximaal één van `school_id` of `training_location_id` mag gevuld zijn
- Beide `NULL` = geen gestructureerde locatie (vrije tekst `location` veld)

### 1.3 Kolom toevoegen aan `simulation_scenario_slots`

```sql
ALTER TABLE public.simulation_scenario_slots
  ADD COLUMN school_id uuid REFERENCES public.schools(id),
  ADD COLUMN training_location_id uuid REFERENCES public.training_locations(id);
```

Scenario-slots krijgen hiermee een optionele locatiereferentie, zodat bij omzetting naar planning de locatie meegenomen kan worden.

### 1.4 RPC `convert_scenario_to_planning` aanpassen

Bij het aanmaken van een programma uit een slot:
- `school_id` en `training_location_id` uit de slot overnemen naar het nieuwe `programs` record

## Fase 2: Centrale locatie-abstractielaag (`src/lib/locationUtils.ts`)

Nieuw bestand met de uniforme locatie-interface:

```typescript
export type LocationSource = "school" | "training_location";

export interface ResolvedLocation {
  source: LocationSource;
  id: string;
  name: string;
  neighborhoodId: string | null;
  areaId: string | null;
  areaName: string | null;
  neighborhoodName: string | null;
  address: string | null;
}

// Resolve locatie voor een programma
export function resolveLocationForProgram(
  program: any,
  schools: any[],
  trainingLocations: any[]
): ResolvedLocation | null

// Resolve locatie voor een scenario-slot
export function resolveLocationForSlot(
  slot: any,
  schools: any[],
  trainingLocations: any[]
): ResolvedLocation | null

// Gecombineerde locatielijst voor dropdowns
export function buildLocationOptions(
  schools: any[],
  trainingLocations: any[]
): { source: LocationSource; id: string; name: string; areaName: string | null }[]

// Resolve area_id vanuit locatie (voor geo-keten)
export function resolveAreaFromLocation(
  source: LocationSource,
  locationId: string,
  schools: any[],
  trainingLocations: any[]
): { areaId: string | null; neighborhoodId: string | null }
```

## Fase 3: Query keys

```typescript
export const trainingLocationKeys = {
  all: ["training-locations"] as const,
};
```

## Fase 4: UI — Trainingslocaties beheren

### 4.1 Navigatie

Nieuwe navlink "Trainingslocaties" in `AppLayout.tsx` (onder "Scholen").

### 4.2 Pagina `TrainingslocatiesPage.tsx`

- CRUD voor trainingslocaties
- Velden: naam, adres, postcode, plaats, wijk (dropdown), gebied (auto-resolve of handmatig), actief, notitie
- Postcode-autodetectie voor gebied/wijk (bestaande `postcodeMapping` logica)
- Filter op gebied, wijk, actief

### 4.3 Route toevoegen in `App.tsx`

## Fase 5: UI — Locatiekeuze in programma's

### 5.1 `ProgrammasPage.tsx` — Nieuw programma aanmaken

Locatiekeuze vervangen:
1. Keuze "School" of "Trainingslocatie" (radio/tabs)
2. Dropdown met de gekozen bron
3. Bij selectie: auto-fill `area_id` en `neighborhood_id` vanuit de gekozen locatie

### 5.2 `ProgramDetailPage.tsx` — Programma bewerken

Zelfde locatiekeuze als bij aanmaken. Toont huidige bron + locatie.

### 5.3 Weergave in lijsten

Locatienaam tonen met type-indicator (bijv. 🏫 of 📍).

## Fase 6: GroupComposer en scenario's

### 6.1 `GroupComposer.tsx`

Bij het aanmaken van een groep:
- Locatiekeuze (school of trainingslocatie) toevoegen naast de bestaande trainer- en datumvelden
- Geselecteerde locatie meesturen bij `createGroup`

### 6.2 Scenario-opslag

`save_scenario` RPC uitbreiden:
- `school_id` en `training_location_id` in slot-data accepteren en opslaan

### 6.3 Scenario-validatie

`validateScenarioSlot` in `clientUtils.ts`:
- Locatie-validatie: als slot een locatie heeft, controleer dat area_id klopt

### 6.4 Omzetting naar planning

`convert_scenario_to_planning` RPC:
- `school_id` en `training_location_id` uit slot overnemen naar het aangemaakte programma

## Fase 7: Rapportages

`RapportagesPage.tsx`:
- Bij breakdown "school" ook trainingslocaties tonen
- Of een nieuwe breakdown "locatie" die beide bronnen combineert

## Fase 8: Tests bijwerken

- `singleSourceOfTruth.test.ts`: exports van `locationUtils.ts` valideren
- Locatie-resolutie testen voor beide bronnen

## Bestanden

| Bestand | Actie |
|---|---|
| SQL migratie | `training_locations` tabel, kolommen op `programs` + `simulation_scenario_slots` |
| `src/lib/locationUtils.ts` | Nieuw — centrale locatie-abstractie |
| `src/lib/queryKeys.ts` | `trainingLocationKeys` toevoegen |
| `src/pages/TrainingslocatiesPage.tsx` | Nieuw — CRUD |
| `src/components/AppLayout.tsx` | Navlink toevoegen |
| `src/App.tsx` | Route toevoegen |
| `src/pages/ProgrammasPage.tsx` | Locatiekeuze school/trainingslocatie |
| `src/pages/ProgramDetailPage.tsx` | Locatiekeuze school/trainingslocatie |
| `src/components/GroupComposer.tsx` | Locatiekeuze bij groep aanmaken |
| `src/lib/clientUtils.ts` | `validateScenarioSlot` uitbreiden |
| SQL migratie (RPC) | `save_scenario` + `convert_scenario_to_planning` aanpassen |
| `src/pages/RapportagesPage.tsx` | Locatie-breakdown |
| `src/test/singleSourceOfTruth.test.ts` | locationUtils exports valideren |

## Implementatievolgorde

1. Database migratie (tabel + kolommen)
2. `locationUtils.ts` + query keys
3. `TrainingslocatiesPage.tsx` + navigatie + route
4. Programma-pagina's (locatiekeuze)
5. GroupComposer (locatiekeuze bij groep)
6. RPC's aanpassen (save_scenario + convert)
7. Scenario-validatie
8. Rapportages
9. Tests
