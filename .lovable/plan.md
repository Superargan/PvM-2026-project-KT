# Analyse & Plan: Planningsmodule uitbreiden  
  
  
Werk dit uit in het bestaande project. Bouw niets opnieuw en maak geen parallelle structuur. Hergebruik bestaande componenten, pagina’s, auth, routing en tabellen waar mogelijk.

Analyseer eerst de bestaande implementatie en breid daarna alleen uit wat ontbreekt. Houd de huidige architectuur leidend.

Gebruik en breid alleen deze bestaande onderdelen uit:

- src/components/ScheduleGenerator.tsx

- src/components/SessionDetails.tsx

- src/components/ProgramAttendance.tsx

- src/pages/ProgramDetailPage.tsx

- src/lib/holidays.ts

- bestaande auth/RLS functies

- bestaande tabellen zoals program_sessions, attendance, client_availability, programs en gerelateerde inschrijvingen

Doel:

- Automatisch een complete planning per dag genereren voor de volledige duur van een training

- Deelnemers alleen laten boeken op geldige en beschikbare sessies

- Feestdagen en schoolvakanties standaard blokkeren

- Alleen backoffice/admin mag met extra bevestiging overrulen

- Overrides verplicht loggen

- Single source of truth strikt waarborgen

- Admin moet maximum en minimum deelnemersregels kunnen overrulen

Voer dit uit:

1. Database

- Voeg kolom `status` toe aan `public.program_sessions`

- type: text

- default: `beschikbaar`

Gebruik alleen deze statuswaarden:

- `beschikbaar`

- `max_aantal_deelnemers_bereikt`

- `minimum_aantal_deelnemers_niet_bereikt`

- `geblokkeerd`

- `feestdag`

- `schoolvakantie`

- `handmatig_vrijgegeven`

- Zorg dat `programs` een minimum en maximum deelnemersinstelling ondersteunt:

  - `min_participants`

  - `max_participants`

- Maak tabel `public.session_override_logs`:

  - `id uuid primary key default gen_random_uuid()`

  - `session_id uuid not null references public.program_sessions(id) on delete cascade`

  - `overridden_by uuid not null`

  - `reason text not null`

  - `override_type text not null`

  - `created_at timestamptz not null default now()`

Gebruik voor `override_type` alleen:

- `feestdag`

- `schoolvakantie`

- `max_aantal_deelnemers`

- `minimum_aantal_deelnemers`

- `handmatige_blokkade`

- Voeg RLS toe zodat alleen backoffice override logs kan lezen en schrijven

2. Single source of truth

- Gebruik `program_sessions.status` als enige persistente bron voor sessiestatus

- Gebruik `programs.max_participants` als enige bron voor maximum capaciteit

- Gebruik `programs.min_participants` als enige bron voor minimum deelnemers

- Bepaal `max_aantal_deelnemers_bereikt` uitsluitend op basis van actieve inschrijvingen versus `max_participants`

- Bepaal `minimum_aantal_deelnemers_niet_bereikt` uitsluitend op basis van actieve inschrijvingen versus `min_participants`

- Gebruik `session_override_logs` als enige audit trail voor overrides

- Gebruik `src/lib/holidays.ts` als enige bron voor feestdagen en schoolvakanties

- Gebruik geen dubbele of concurrerende statuslogica in component state, helpers of extra tabellen

- Laat UI-badges, filters en meldingen altijd uit dezelfde brondata komen

- Voorkom dat dezelfde business rule op meerdere plekken apart wordt geïmplementeerd

- Centraliseer status-, capaciteit-, minimum-, conflict- en override-logica in herbruikbare gedeelde logica

3. ScheduleGenerator

- Geef sessies bij genereren direct een status:

  - `feestdag` bij feestdag

  - `schoolvakantie` bij schoolvakantie

  - anders `beschikbaar`

- Blokkeer standaard conflictdagen

- Alleen backoffice mag overrulen

- Override vereist:

  - bevestiging

  - verplichte reden

  - log in `session_override_logs`

  - status wordt `handmatig_vrijgegeven`

- Valideer:

  - geen startdatum in het verleden

  - geen sessies buiten trainingsperiode

4. SessionDetails

- Toon statusbadge per sessie

- Geblokkeerde sessies niet normaal bewerkbaar

- Bij handmatige datumwijziging naar feestdag of schoolvakantie:

  - direct waarschuwing

  - standaard blokkeren

  - alleen backoffice override met reden

5. ProgramAttendance

- Voeg statusfilter toe:

  - Alle

  - Beschikbaar

  - Max aantal deelnemers bereikt

  - Minimum aantal deelnemers niet bereikt

  - Geblokkeerd

  - Feestdag

  - Schoolvakantie

  - Handmatig vrijgegeven

- Toon badges en capaciteitsinformatie duidelijk

- Toon zowel minimum als maximum deelnemersgrenzen

6. ProgramDetailPage

- Weiger toevoegen deelnemer als `max_participants` is bereikt, behalve als admin expliciet overrult

- Signaleer wanneer `min_participants` niet is bereikt

- Controleer overlap per deelnemer op sessiedatum + tijd met andere programma’s

- Toon duidelijke foutmelding bij conflict, bereikt maximum of niet bereikt minimum

7. Override-logica voor admin

- Alleen backoffice/admin mag overrides uitvoeren

- Admin mag deze regels overrulen:

  - feestdag

  - schoolvakantie

  - max aantal deelnemers bereikt

  - minimum aantal deelnemers niet bereikt

- Iedere override vereist:

  - expliciete bevestiging

  - verplichte reden

  - logging in `session_override_logs`

- De override moet zichtbaar zijn in de UI en auditbaar blijven

8. Statuslogica

- Gebruik `max_aantal_deelnemers_bereikt` in plaats van `vol`

- Gebruik `minimum_aantal_deelnemers_niet_bereikt` voor situaties waarin een training of sessie onder de minimale bezetting zit

- Bepaal deze statussen op basis van actieve inschrijvingen versus `min_participants` en `max_participants`

- Gebruik aanwezigheid nooit als criterium

- Als aantal inschrijvingen weer binnen de grenzen valt, zet status terug naar `beschikbaar`, tenzij een andere blokkadestatus geldt

- Laat blokkadestatussen zoals `feestdag`, `schoolvakantie` en `geblokkeerd` altijd voorgaan op capaciteitsstatus

- Laat handmatige admin-override altijd expliciet herkenbaar blijven

9. UI-tekst

Gebruik overal in de interface:

- `Max aantal deelnemers bereikt`

- `Minimum aantal deelnemers niet bereikt`

Gebruik nergens:

- `Vol`

Gebruik bij override-waarschuwing deze teksten:

- `Weet je het zeker? Dit moment valt op een feestdag of in een schoolvakantie.`

- `Weet je het zeker? Het maximum aantal deelnemers is bereikt.`

- `Weet je het zeker? Het minimum aantal deelnemers is niet bereikt.`

10. Implementatiegrenzen

- Maak geen nieuwe pagina’s als bestaande pagina’s kunnen worden uitgebreid

- Maak geen nieuwe parallelle modellen als bestaande tabellen leidend kunnen blijven

- Refactor alleen waar nodig om logica te centraliseren en duplicatie te voorkomen

- Behoud bestaande routing, auth en layout

Laat na afloop kort zien:

- welke migratie is toegevoegd

- welke bestanden zijn aangepast

- welke bestaande onderdelen zijn hergebruikt

- hoe single source of truth concreet is geborgd

- hoe admin-overrides voor minimum en maximum deelnemers zijn ingericht

## Bestaande onderdelen die worden hergebruikt


| Onderdeel                   | Bestand                                | Status                                                                |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| `ScheduleGenerator`         | `src/components/ScheduleGenerator.tsx` | Bestaat — genereert sessies, checkt feestdagen, toont beschikbaarheid |
| `SessionDetails`            | `src/components/SessionDetails.tsx`    | Bestaat — datum/tijd/locatie per sessie bewerken                      |
| `ProgramAttendance`         | `src/components/ProgramAttendance.tsx` | Bestaat — presentie + bijeenkomsten tabs                              |
| `ProgramDetailPage`         | `src/pages/ProgramDetailPage.tsx`      | Bestaat — tabstructuur deelnemers/trainers/sessies                    |
| Feestdagen/vakanties        | `src/lib/holidays.ts`                  | Bestaat — `isSpecialDay`, `HOLIDAYS`, `SCHOOL_VACATIONS`              |
| `program_sessions` tabel    | DB                                     | Bestaat — met `start_time`, `end_time`, `session_date`                |
| `attendance` tabel          | DB                                     | Bestaat — present/absent per sessie per client                        |
| `client_availability` tabel | DB                                     | Bestaat — beschikbaarheid per datum                                   |
| Auth + RLS                  | DB                                     | Bestaat — `is_backoffice()`, `is_trainer()` functies                  |


## Wat ontbreekt (toe te voegen)

### 1. Sessiestatus-veld op `program_sessions`

Momenteel heeft een sessie geen status. Toevoegen:

- `status` kolom: `beschikbaar` | `vol` | `geblokkeerd` | `feestdag` | `schoolvakantie` | `handmatig_vrijgegeven`
- Default: `beschikbaar`

### 2. Override-log tabel (`session_override_logs`)

Nieuwe tabel voor het loggen van admin-overrides:

- `id`, `session_id`, `overridden_by` (user_id), `reason` (text, verplicht), `created_at`
- RLS: alleen backoffice mag inserten en lezen

### 3. ScheduleGenerator aanpassingen

Het component bestaat al en doet 80% van wat gevraagd wordt. Aanvullingen:

- **Status toekennen**: bij genereren automatisch `feestdag`/`schoolvakantie` status zetten op conflictdatums in plaats van alleen een badge
- **Override met reden**: het bevestigingsdialog uitbreiden met een verplicht redenveld + opslag in `session_override_logs`
- **Validatie geen verleden**: startdatum mag niet in het verleden liggen
- **Validatie trainingsperiode**: sessiedatums moeten binnen start-/einddatum programma vallen
- **Status "vol"**: na opslaan, sessies met max deelnemers markeren als `vol`

### 4. SessionDetails aanpassingen

- Statusbadge tonen per sessie (kleurgecodeerd)
- Geblokkeerde sessies niet bewerkbaar tonen (tenzij admin override)
- Bij handmatig datum wijzigen naar feestdag/vakantie: blokkeer + waarschuw

### 5. UI badges en filters in ProgramAttendance

- Statusfilter toevoegen boven de sessies (Alle / Beschikbaar / Geblokkeerd / etc.)
- Kleur-badges per sessie in de presentielijst header

### 6. Capaciteitsbewaking

De `program_clients` tabel + `max_participants` op `programs` bestaan al. Toevoegen:

- Check bij toevoegen deelnemer: weiger als `enrolledClients.length >= program.max_participants`
- Sessies automatisch op "vol" als alle enrolled clients aanwezig zijn

### 7. Overlap-validatie

Bij toevoegen deelnemer aan programma: check of de client al in een ander programma zit met overlappende sessiedatums/tijden.

## Database-wijzigingen

```sql
-- 1. Status op program_sessions
ALTER TABLE public.program_sessions 
  ADD COLUMN status text NOT NULL DEFAULT 'beschikbaar';

-- 2. Override logs tabel
CREATE TABLE public.session_override_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.program_sessions(id) ON DELETE CASCADE,
  overridden_by uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_override_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backoffice manages override logs"
  ON public.session_override_logs FOR ALL
  TO authenticated
  USING (is_backoffice())
  WITH CHECK (is_backoffice());
```

## Gewijzigde bestanden


| Bestand                                | Wijziging                                                               |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `src/components/ScheduleGenerator.tsx` | Status-toekenning, override met reden + log, validatie verleden/periode |
| `src/components/SessionDetails.tsx`    | Statusbadge, blokkering geblokkeerde sessies                            |
| `src/components/ProgramAttendance.tsx` | Statusfilter, capaciteitsindicator                                      |
| `src/pages/ProgramDetailPage.tsx`      | Capaciteitscheck bij toevoegen deelnemer, overlap-validatie             |
| DB migratie                            | `status` kolom + `session_override_logs` tabel                          |


Geen nieuwe pagina's, routing of auth-wijzigingen nodig.  
  
