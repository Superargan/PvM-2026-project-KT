

## Plan: Drie-fasen scheiding — Simulatie / Proforma / Definitieve planning

### Samenvatting

Dit plan implementeert een harde, afdwingbare scheiding tussen drie fasen (simulatie, proforma planning, definitieve planning), inclusief alle aangescherpte eisen rond concurrency-veilige nummering, brede blokkade van definitieve writes, stabiele dirty-state tracking, expliciete training-kolom modellering en proforma als echte workflowlaag.

---

### 1. Database migratie

**A. Proformanummer — concurrency-safe via Postgres SEQUENCE**

```sql
-- Dedicated sequence — botst nooit bij gelijktijdige inserts
CREATE SEQUENCE IF NOT EXISTS public.proforma_number_seq START 1;

ALTER TABLE public.simulation_scenarios
  ADD COLUMN proforma_number text UNIQUE;

-- Generatorfunctie met sequence (concurrency-safe, geen max+1)
CREATE OR REPLACE FUNCTION public.generate_proforma_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year text := extract(year from now())::text;
  v_seq bigint;
BEGIN
  v_seq := nextval('public.proforma_number_seq');
  RETURN 'PF-' || v_year || '-' || lpad(v_seq::text, 3, '0');
END;
$$;
```

**B. `save_scenario` RPC aanpassen**
- Bij INSERT (nieuw scenario): automatisch `proforma_number := generate_proforma_number()`
- Bij UPDATE: proforma_number blijft ongewijzigd

---

### 2. GroupComposer.tsx — Harde blokkade definitieve writes

**A. `createGroup` blokkeren op ALLE niet-definitieve werkstatussen**

Een computed guard `canCreateDefinitiveGroup` die `false` retourneert wanneer:
- `isSimulating === true` (actieve simulatie)
- `isDirty === true` (onopgeslagen wijzigingen)
- `simulatedGroups.size > 0` (niet-opgeslagen proforma-data)
- `activeScenarioId !== null` (werkend vanuit proforma-context — moet eerst omgezet worden)

De "Groep aanmaken"-knop wordt **disabled** met een tooltip die de blokkadereden toont. Geen enkel zijpad mag definitieve writes mogelijk maken vanuit een niet-afgeronde werkstate.

**B. Verplichte bevestigingsdialoog (AlertDialog)**

Wanneer `canCreateDefinitiveGroup === true`, vereist "Groep aanmaken" nog steeds een AlertDialog met:
- "Dit maakt direct een definitief programma aan"
- "Deelnemers worden op 'actief' gezet en zichtbaar in het deelnemersoverzicht"
- "Deze actie kan niet ongedaan worden gemaakt"
- Knoppen: "Annuleren" / "Definitief aanmaken"

**C. Expose `isSimulating` + `simulatedGroups.size` in GroupComposerHandle**

Uitbreiden naar:
```ts
export interface GroupComposerHandle {
  triggerSave: () => Promise<boolean>;
  hasActiveSimulation: boolean;
  isDirty: boolean;
  hasUnsavedWork: boolean; // simulatedGroups.size > 0 || isDirty
}
```

---

### 3. PlanningPage.tsx — Stabiele dirty-state bescherming

**A. Parent-level dirty-state tracking**

Nieuwe state `hasUnsavedWork` die via `useEffect` periodiek (of via callback) de ref-waarde `groupComposerRef.current?.hasUnsavedWork` synchroniseert naar parent state. Dit voorkomt dat tab-switch guards op een stale ref-waarde vertrouwen.

**B. Tab-switch guard met 3-keuze Dialog**

Wrap `onValueChange` van `<Tabs>`:
- Als `hasUnsavedWork && showGroupComposer`:
  - Dialog: "Opslaan als proforma" / "Verwerpen" / "Annuleren"
  - Bij "Opslaan": `triggerSave()`, dan switch
  - Bij "Verwerpen": reset, switch
  - Bij "Annuleren": geen actie

**C. Back-knop guard**

Vervang `window.confirm` door dezelfde 3-keuze Dialog.

**D. `beforeunload` guard**

`useEffect` die `beforeunload` event registreert wanneer `hasUnsavedWork === true`.

---

### 4. UI-terminologie — Proforma als echte workflowlaag

**A. ScenarioOverview.tsx**

Statusdefinities worden proforma-workflow:

| Huidige status | Nieuwe label | Functionele betekenis |
|---|---|---|
| `concept` | Proforma concept | Bewerkbaar werkvoorstel |
| `vastgezet` | Proforma vastgezet | Inhoudelijk akkoord, nog niet omgezet |
| `in_uitwerking` | Proforma in uitwerking | Actief bewerkt werkvoorstel |
| `gecontroleerd` | Proforma gecontroleerd | Klaar voor omzetting |
| `gedeeltelijk_omgezet` | Gedeeltelijk omgezet | Deels naar definitieve planning |
| `definitief` | Definitief (omgezet) | Volledig omgezet |

Nieuwe kolom "PF-nr." die `proforma_number` toont.

**B. GroupComposer.tsx banner**

- Simulatiebanner: "Simulatie (niet opgeslagen)"
- Na opslaan: "Proforma planning: PF-2026-001"
- "Opslaan" → "Opslaan als proforma"
- "Omzetten" → "Omzetten naar definitieve planning"

---

### 5. ClientenPage.tsx — Training-kolom met expliciete interface

**A. Typed interface voor programma-data**

```ts
interface ClientProgram {
  program_id: string;
  programs: {
    id: string;
    name: string;
    training_number: string | null;
    status: string | null;
    archived: boolean;
  };
}

interface ClientWithPrograms {
  // ...existing client fields
  program_clients: ClientProgram[];
}
```

**B. Query uitbreiden**

```ts
.select("*, neighborhoods:..., schools(...), program_clients(program_id, programs(id, name, training_number, status, archived))")
```

Uitsluitend definitieve `program_clients` data. Geen joins op scenario-tabellen.

**C. Deduplicatie**

1 rij per client. Meerdere programma's als geneste array. Geen dubbele clientrijen.

**D. Sortering programma's**

Actieve programma's (status `gepland`/`gestart`) eerst, dan afgeronde, dan gearchiveerde. Expliciet en eenduidig.

---

### 6. ClientListTable.tsx — Training-kolom

**A. Nieuwe prop `showTraining?: boolean`**

Wanneer `true`: kolom "Training" na "Gebied" met Badge per programma:
- Actieve: groene badge met trainingsnummer + naam
- Afgeronde: grijze badge
- Gearchiveerde: niet getoond

**B. Geen proforma/scenario-data**

De kolom toont uitsluitend data uit `program_clients` → `programs`. Geen menging met scenario-tabellen.

---

### 7. Export uitbreiden

CSV/XLSX export in `ClientenPage` krijgt kolom "Training" met exact dezelfde data als de UI-tabel. Meerdere programma's per client worden als komma-gescheiden lijst getoond.

---

### Bestanden die wijzigen

| Bestand | Wijziging |
|---|---|
| SQL migratie | `proforma_number`, sequence, `generate_proforma_number()`, `save_scenario` update |
| `src/components/GroupComposer.tsx` | Brede blokkade `createGroup`, bevestigingsdialoog, handle uitbreiding, terminologie |
| `src/pages/PlanningPage.tsx` | Parent dirty-state sync, tab-switch/back/beforeunload guards |
| `src/components/ScenarioOverview.tsx` | Proforma labels, PF-nr. kolom |
| `src/pages/ClientenPage.tsx` | Query + export + typed interface |
| `src/components/ClientListTable.tsx` | Training-kolom met `showTraining` prop |

### Write-flow documentatie

| Actie | Schrijft naar | Fase |
|---|---|---|
| `toggleSimulation()` | Geen DB | Simulatie |
| `handleSaveScenario()` | `simulation_scenarios`, `_slots`, `_members` | Proforma |
| `handleConvert()` (RPC) | `programs`, `program_clients`, `clients.intake_status` | Definitief |
| `createGroup()` | `programs`, `program_clients`, `clients.intake_status` | Definitief (geblokkeerd vanuit proforma/simulatie) |

### Acceptatiecriteria

1. `createGroup` geblokkeerd bij: actieve simulatie, dirty state, niet-opgeslagen proforma, actief scenario
2. `createGroup` vereist altijd bevestigingsdialoog — geen write zonder expliciete bevestiging
3. Proformanummer concurrency-safe via Postgres SEQUENCE
4. Proforma opslag schrijft nooit naar `programs`/`program_clients`/`clients.intake_status`
5. Dirty state tracked op parent-level, niet alleen via ref
6. Tab-switch, back en beforeunload geblokkeerd bij unsaved work
7. Deelnemerspagina leest uitsluitend `clients` + `program_clients` — geen scenario-tabellen
8. Training-kolom toont alleen definitieve programma's, met expliciete sortering
9. Export identiek aan UI-weergave
10. UI-terminologie reflecteert proforma-workflow consistent

