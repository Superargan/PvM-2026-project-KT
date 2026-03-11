

## Plan: Meerdere trainingsvoorstellen, uitklapbare kaarten en doorklikbare foutmeldingen

### 1. Meerdere trainingsvoorstellen per groep

**Huidige situatie**: `getAvailabilityOverlap` in `clientUtils.ts` retourneert slechts 1 voorstel. `GroupComposer` toont dit ene voorstel per groepskaart.

**Aanpassing**:
- Wijzig `getAvailabilityOverlap` (of maak een variant `getTopAvailabilityOverlaps`) die de top-3 niet-overlappende tijdslots retourneert, gesorteerd op overlap-score.
- Pas `GroupComposer` aan om alle 3 voorstellen te renderen, elk met dag, tijdslot en aantal beschikbare deelnemers. Nummer ze als "Voorstel 1", "Voorstel 2", "Voorstel 3".

### 2. Uitklapbare groepskaarten (groter / volledig scherm)

**Huidige situatie**: Groepskaarten staan in een vaste `grid md:grid-cols-2` layout.

**Aanpassing**:
- Voeg een expand-knop toe aan elke `Card` header (Maximize2 icon).
- Bij klik opent een `Dialog` met `max-w-4xl` die de volledige kaartinhoud toont in een ruimere layout (clientlijst zonder max-height beperking, trainerselectie naast elkaar, alle voorstellen zichtbaar).
- Alternatief: toggle de kaart naar `col-span-2` voor een "groot" formaat, met een tweede klik naar een fullscreen Dialog.

### 3. Doorklikbare foutmeldingen

**Huidige situatie**: De 5 `WarningButton`s tonen alleen tooltips met namen. `warningFilter` state bestaat maar is niet gekoppeld aan een dialog.

**Aanpassing**:
- Koppel `onClick` aan elke `WarningButton` om `warningFilter` te zetten (bijv. `"noAvail"`, `"unusable"`, etc.).
- Voeg een `Dialog` toe die opent wanneer `warningFilter` niet null is. Inhoud:
  - Titel met waarschuwingstype
  - Doorzoekbare lijst van betreffende deelnemers
  - Elke deelnemer is een klikbare link (`navigate(/clienten/{id})`) die direct naar het dossier navigeert
  - Toon ook gebied en status per deelnemer voor context

### Bestanden die wijzigen

| Bestand | Wijziging |
|---|---|
| `src/lib/clientUtils.ts` | Nieuwe functie `getTopAvailabilityOverlaps` die meerdere voorstellen retourneert |
| `src/components/GroupComposer.tsx` | Meerdere voorstellen tonen, expand-knop + fullscreen Dialog per kaart |
| `src/pages/PlanningPage.tsx` | Warning dialog met doorklikbare deelnemerslijst, onClick handlers op WarningButtons |

