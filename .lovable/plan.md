

# Plan: Import "opmerking bij beschikbaarheid" naar gebiedsnotities + Gebied/Reserve op beschikbaarheid-tab

## Wat moet er gebeuren

1. **Import: kolom "opmerking bij beschikbaarheid" → `area_notes`**
   - In `ClientImport.tsx`, na het parsen van de andere velden, een `findCol` toevoegen voor kolommen als "Opmerking bij beschikbaarheid", "Opmerkingen beschikbaarheid", "Opmerkingen", "Bijzonderheden"
   - De gevonden waarde toewijzen aan `area_notes` in het `recordData` object
   - Bij update-modus: `area_notes` appenden (niet overschrijven) als er al bestaande notities zijn

2. **Beschikbaarheid-tab: gebied, reservegebied en gebiedsnotities tonen**
   - In `ClientDetailPage.tsx`, de beschikbaarheid-tab uitbreiden met een readonly weergave van:
     - Primair gebied (resolved via `getResolvedAreaName`)
     - Reserve-gebieden (uit `client_area_preferences`)
     - Flexibel-status
     - Gebiedsnotities (`area_notes`) — als readonly tekst (bewerken blijft op de gegevens-tab via AreaPreferencesEditor)
   - Dit wordt een compact informatieblok boven de `AvailabilityManager`

## Bestanden

1. `src/components/ClientImport.tsx` — `findCol` voor opmerking + toevoegen aan recordData + append-logica bij updates
2. `src/pages/ClientDetailPage.tsx` — beschikbaarheid-tab: gebied/reserve/notities blok toevoegen, client query uitbreiden met area-relaties + area preferences ophalen

