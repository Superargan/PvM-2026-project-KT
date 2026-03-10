

# Plan: Reserve-gebieden en geoptimaliseerde planningsmodule

## Overzicht

Deelnemers krijgen tot 3 extra "reserve" gebieden naast hun primaire gebied, plus een optie "alle gebieden". De planningsmodule (WaitlistOverview + GroupComposer) zoekt automatisch op deze reserves en toont per deelnemer vanuit welke voorkeur ze gematcht zijn.

## Database-wijzigingen

Nieuwe tabel `client_area_preferences` voor de reserve-gebieden:

```sql
CREATE TABLE public.client_area_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  preference_order integer NOT NULL DEFAULT 1, -- 1, 2 of 3
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, area_id)
);

ALTER TABLE public.client_area_preferences ENABLE ROW LEVEL SECURITY;
-- RLS policies: backoffice CRUD, trainers SELECT
```

Nieuw veld op `clients` tabel:

```sql
ALTER TABLE public.clients ADD COLUMN all_areas_flexible boolean NOT NULL DEFAULT false;
```

Dit boolean-veld geeft aan dat de deelnemer in elk gebied geplaatst mag worden.

## Code-wijzigingen

### 1. ClientDetailPage.tsx — Reserve-gebieden sectie

Na het bestaande "Gebied" dropdown (regel ~462-470), een nieuwe sectie toevoegen:

- **"Flexibel inzetbaar (alle gebieden)"** checkbox die `all_areas_flexible` toggelt
- **3 extra dropdown-velden** voor reserve-gebieden (voorkeur 1, 2, 3), gefilterd zodat het primaire gebied en al gekozen reserves niet dubbel voorkomen
- Bij opslaan: de `client_area_preferences` tabel syncen (delete + insert)
- Data laden via extra query op `client_area_preferences` voor de huidige client

### 2. AanmeldingenPage.tsx — Reserve-gebieden in bewerkdialog

In het bestaande edit-formulier dezelfde reserve-gebied velden toevoegen, zodat het ook bij aanmelding/intake direct ingevuld kan worden.

### 3. WaitlistOverview.tsx — Matrix inclusief reserves

De wachtlijst-matrix nu uitbreiden:
- Query `client_area_preferences` mee-laden voor alle wachtlijst-deelnemers
- Per deelnemer tellen voor **primair gebied** en alle **reserve-gebieden** (en `all_areas_flexible`)
- In de matrix-cellen een onderscheid tonen: bijv. "5 + 3" (5 primair, 3 reserve)
- Kleurcodering aanpassen: groen als primair + reserve samen >= 7

### 4. GroupComposer.tsx — Matching met reserve-gebieden

De groepssamenstelling uitbreiden:
- Bij het groeperen van deelnemers per gebied, ook deelnemers met dat gebied als reserve-voorkeur of `all_areas_flexible = true` meenemen
- Per deelnemer in de lijst een badge tonen: "Primair", "Reserve 1", "Reserve 2", "Reserve 3" of "Flexibel"
- Sorteer primaire matches bovenaan, dan reserve op volgorde

### 5. Automatische groepsdetectie

In de WaitlistOverview een visuele indicator toevoegen die automatisch berekent:
- Per gebied+leeftijd: hoeveel deelnemers (primair + reserves) beschikbaar zijn
- Als het totaal >= 7 is, een "Groep mogelijk" badge tonen met breakdown per voorkeurtype
- Klikbaar om direct naar GroupComposer te gaan met die selectie

## Technische details

**Nieuwe bestanden:** geen (wijzigingen in bestaande componenten)

**Gewijzigde bestanden:**
- `src/pages/ClientDetailPage.tsx` — reserve-gebieden UI + data-opslag
- `src/pages/AanmeldingenPage.tsx` — reserve-gebieden in edit-dialog
- `src/components/WaitlistOverview.tsx` — matrix met reserves
- `src/components/GroupComposer.tsx` — matching-logica met badges
- `src/lib/queryKeys.ts` — queryKey voor `client_area_preferences`

**Database-migratie:**
- Nieuwe tabel `client_area_preferences` met RLS
- Nieuw veld `all_areas_flexible` op `clients`

