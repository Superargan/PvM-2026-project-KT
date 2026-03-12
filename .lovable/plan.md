

## Probleem

De functie `hasAvailabilityCoverage` controleert nu of beschikbaarheid **4 maanden** vooruit loopt (`monthsAhead = 4`). Dit triggert te vroeg — de waarschuwing moet pas verschijnen wanneer de dekking onder de **3 maanden** zakt.

## Aanpassing

1. **`src/lib/clientUtils.ts`** — Verander de default parameter van `monthsAhead = 4` naar `monthsAhead = 3` in `hasAvailabilityCoverage`.

2. **`src/components/AvailabilityValidation.tsx`** — Update alle tekstuele referenties van "4 maanden" naar "3 maanden" in de toelichting/reden-kolom.

3. **`src/pages/PlanningPage.tsx`** — Update de waarschuwingstekst van "4 maanden" naar "3 maanden".

4. **`src/lib/clientUtils.ts` (regel ~544)** — Update de issues-tekst in `validateScenario` van "4 maanden" naar "3 maanden".

5. **`src/test/scenarioValidation.test.ts`** — Update tests zodat ze de nieuwe 3-maandsdrempel reflecteren.

6. **Actualiseer-knop** — De knop "Actualiseer 4 maanden" blijft 4 maanden vooruit genereren (dat is goed, want het vult ruim voorbij de 3-maandsdrempel).

