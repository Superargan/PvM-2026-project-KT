# Plan: Automatische Planningsgenerator met Feestdag/Vakantie-check

## Huidige situatie

- Bij het aanmaken van een groep (`GroupComposer`) wordt een programma aangemaakt met een startdatum, maar **geen sessies gegenereerd**
- Sessies worden pas aangemaakt in `ProgramAttendance` (lege sessies zonder datum, alleen `session_number`)
- Sessiedatums worden handmatig per stuk ingevuld via `SessionDetails`
- Feestdagen/vakanties worden visueel getoond in de agenda, maar **niet** gebruikt bij het plannen van sessies

## Wat wordt gebouwd

### 1. Sessie-planningsgenerator component (`ScheduleGenerator`)

Een nieuw component op de **ProgramDetailPage** (Sessies-tab) dat:

- **Automatisch alle sessiedatums genereert** op basis van:
  - Startdatum (uit programma of handmatig kiezen)
  - Vaste weekdag (ma/di/wo/do/vr/za/zo
  - Vast tijdstip (start- en eindtijd) doe voorstel op basis van grootste gemene deler van de aanmelders
  - Aantal sessies (KT=10, SV=12)
- **Feestdagen en vakanties checkt** via `src/lib/holidays.ts`:
  - Conflicterende datums worden rood gemarkeerd
  - Het systeem slaat deze automatisch over en kiest de eerstvolgende vrije datum
  - Gebruiker kan bij handmatige planning een conflict alsnog accepteren via "Weet je het zeker?"-bevestiging, tevens aangeven na de automatische planning welke data overgeslagen zijn
- **Resultaat toont als overzichtelijke tabel** met per sessie:
  - Sessienummer, datum, dag, tijdstip, locatie
  - Waarschuwingsbadge bij feestdag/vakantie
  - Bewerkknop per rij voor handmatige aanpassing

### 2. Handmatig aanpassen na genereren

- Elke sessie kan individueel worden aangepast (datum, tijd, locatie)
- Bij het wijzigen van een datum wordt opnieuw gecheckt op feestdag/vakantie
- Wijzigingen worden direct opgeslagen in `program_sessions`

### 3. Database-aanpassing

De `program_sessions` tabel krijgt twee extra kolommen:

- `start_time` (time) — starttijd van de sessie
- `end_time` (time) — eindtijd van de sessie

Dit maakt het mogelijk om een compleet dagschema te tonen.

### 4. Deelnemerbeschikbaarheid-check

Na het genereren van het schema worden de deelnemers van het programma gecheckt het moet ook the other way around mogelijk zijn, bijvoorbeeld er zijn zoveel aanmeldingen in die leeftijdsgroep in dat gebied, de mogelijkheid om inderdaad de training vanuit "verzoek" of op aangeven van een school die op dezelfde school georganiseerd mag worden. :

- Per sessiedatum wordt gekeken of deelnemers beschikbaar zijn (via `client_availability`)
- Deelnemers die niet beschikbaar zijn op een sessiedatum krijgen een waarschuwing
- Suggestie: "Vraag [naam] of [andere dag] mogelijk is"

## Gewijzigde/nieuwe bestanden


| Bestand                                | Actie                                                        |
| -------------------------------------- | ------------------------------------------------------------ |
| `src/components/ScheduleGenerator.tsx` | Nieuw — planningsgenerator component                         |
| `src/components/ProgramAttendance.tsx` | Integratie met ScheduleGenerator                             |
| `src/components/SessionDetails.tsx`    | Toevoegen start_time/end_time velden + feestdag-waarschuwing |
| `src/pages/ProgramDetailPage.tsx`      | Geen wijziging nodig (gebruikt ProgramAttendance)            |
| Database migratie                      | `start_time` en `end_time` kolommen op `program_sessions`    |


## Technische flow

```text
Startdatum + Weekdag + Tijdstip
        │
        ▼
  Genereer N datums (wekelijks)
        │
        ▼
  Per datum: check holidays.ts
        │
   ┌────┴────┐
   │conflict  │geen conflict
   ▼          ▼
  Skip,       Sessie OK
  volgende    
  week        
        │
        ▼
  Toon overzicht met warnings
        │
        ▼
  "Bevestig planning" → upsert program_sessions
        │
        ▼
  Check deelnemerbeschikbaarheid
  → toon warnings per sessie
```

## UX-flow

1. Gebruiker opent programma → Sessies & Presentie tab
2. Als er nog geen datums zijn: "Genereer planning" knop
3. Kies weekdag + tijdstip → preview met alle sessiedatums
4. Rode waarschuwingen bij feestdagen/vakanties (automatisch overgeslagen)
5. Gebruiker kan per sessie datum handmatig aanpassen
6. "Bevestig" slaat alles op
7. Na bevestiging: beschikbaarheidscheck per deelnemer per sessie