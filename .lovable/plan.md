

# Plan: Consistente look & feel door de hele flow + Schooloverzicht met trainingen en statussen

## Probleemanalyse

De drie hoofdpagina's (Aanmeldingen, Deelnemers, Wachtlijst) tonen momenteel:
- **Verschillende tabelkolommen** per pagina (AanmeldingenPage toont Naam/Leeftijdsgroep/School/Gebied/Telefoon/Status; ClientenPage toont Naam/Leeftijd/School/Ouder/Status; WachtlijstPage toont Naam/Leeftijd/School/Gebied/Inschrijving/Intake/Status)
- **Verschillende tabellen** (AanmeldingenPage gebruikt een aparte `ClientTable` component, ClientenPage gebruikt een inline `<table>`, WachtlijstPage gebruikt de shadcn `Table` component)
- **Verschillende status-labels en styling** (WachtlijstPage heeft eigen `statusLabels` met "Wachtend"/"Uitgevallen", andere pagina's gebruiken de lifecycle-labels)
- **Geen statusfilter** - alleen Gebied/School/Leeftijd maar niet op status
- **ScholenPage mist** aanmeldingentellingen, trainingsoverzicht en statusverdeling per school

## Plan van aanpak

### 1. Gedeelde `ClientListTable` component maken
Nieuwe component `src/components/ClientListTable.tsx` die op alle drie pagina's wordt gebruikt met consistente kolommen:

| Naam | Leeftijd | School | Gebied | Ouder/Telefoon | Aanmelddatum | Status | Actie |

- Uniform design met dezelfde `rounded-xl border` stijl
- Gedeelde `statusLabels`, `statusStyles`, en `calculateAge` functies (verplaatst naar een gedeeld bestand `src/lib/clientUtils.ts`)
- Optionele kolommen (checkbox, toegewezen) via props

### 2. Gedeelde `ClientFilters` component maken
Nieuwe component `src/components/ClientFilters.tsx` met:
- Zoekveld (naam)
- Gebied filter
- School filter
- Leeftijd filter (5-7, 8-12, Overig)
- **Status filter** (nieuw: alle lifecycle-statussen)
- "Wis filters" knop
- Telt gefilterde resultaten vs totaal

### 3. Alle drie pagina's refactoren
- **AanmeldingenPage**: Vervang inline filters en `ClientTable` door `ClientFilters` + `ClientListTable`. Tabs behouden (Aanmeldingen/Intakes afgerond/Wachtlijst/Controle), maar filters gelden nu overal.
- **ClientenPage**: Vervang inline tabel door `ClientListTable`, vervang inline filters door `ClientFilters`.
- **WachtlijstPage**: Vervang inline tabel door `ClientListTable`, vervang inline filters door `ClientFilters`. Verwijder eigen `statusLabels`/`statusColors`.

### 4. Gedeelde utilities verplaatsen
Nieuw bestand `src/lib/clientUtils.ts`:
- `calculateAge()`
- `statusLabels` (de volledige lifecycle map)
- `statusStyles` (de kleuren map)
- `getAgeGroup()` helper

### 5. ScholenPage uitbreiden met trainingen en statussen
Op de ScholenPage per school extra kolommen/informatie tonen:
- **Aanmeldingen**: tel clients met `school_id` = school (alle statussen in intake-flow)
- **Deelnemers**: tel clients met status actief/afgerond/gestopt
- **Trainingen**: tel programma's gekoppeld aan de school via `programs.school_id`
- Klikbaar om door te navigeren naar gefilterde lijstpagina

Dit vereist dat de schoolquery wordt uitgebreid om counts op te halen:
```sql
-- Geen DB-wijziging nodig, client-side aggregatie via extra queries
```

Extra queries op ScholenPage:
- Clients grouped by school_id en intake_status
- Programs grouped by school_id

### 6. Schooldetail-overlay met statusverdeling
Als je op een school klikt in de statistiekenkolommen, toon een dialog/sectie met:
- Lijst van trainingen bij die school (naam, status, periode)
- Statusverdeling van aanmeldingen (badge per status met telling)
- Snellink naar gefilterde Aanmeldingen/Deelnemers pagina

## Technische details

**Nieuwe bestanden:**
- `src/lib/clientUtils.ts` - gedeelde helpers
- `src/components/ClientFilters.tsx` - herbruikbare filterbar
- `src/components/ClientListTable.tsx` - herbruikbare tabel

**Gewijzigde bestanden:**
- `src/pages/AanmeldingenPage.tsx` - refactor naar gedeelde componenten
- `src/pages/ClientenPage.tsx` - refactor naar gedeelde componenten
- `src/pages/WachtlijstPage.tsx` - refactor naar gedeelde componenten
- `src/pages/ScholenPage.tsx` - trainingen, aanmeldingen en statusoverzicht toevoegen

**Geen database-migraties nodig** - alle data is al beschikbaar via bestaande tabellen.

