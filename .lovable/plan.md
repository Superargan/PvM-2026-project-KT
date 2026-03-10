

## Plan: Leeftijdsgroep terugzetten naar 5-7 jaar

De ondergrens van de jongste leeftijdscategorie wordt teruggebracht van 4 naar 5 jaar in alle relevante bestanden:

### Wijzigingen

1. **`src/components/GroupComposer.tsx`** — `AgeCategory` type en `getAgeCategory` functie: `4-7 jaar` → `5-7 jaar`, age check `>= 4` → `>= 5`. Alle string-referenties updaten.

2. **`src/components/WaitlistOverview.tsx`** — Zelfde aanpassingen: type, functie, `ageCategories` array, matrix keys, en legenda.

3. **`src/pages/PlanningPage.tsx`** — Filter-opties en labels updaten van `4-7 jaar` naar `5-7 jaar`.

