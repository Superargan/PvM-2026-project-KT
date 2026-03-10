

# Plan: Statusonderscheid, reservegebied-zoekknop en beschikbaarheidsintegratie in planning

## Samenvatting

De planningsmodule maakt nu geen onderscheid tussen statussen "wachtlijst" en "intake_afgerond". Dit plan voert drie verbeteringen door: (1) duidelijke visuele scheiding op status, (2) een knop om via reservegebieden extra kandidaten te vinden, (3) automatische beschikbaarheidsweergave bij het bekijken van een gebied/leeftijd combinatie, en (4) centralisatie van gedeelde logica.

## Wijzigingen

### 1. WaitlistOverview.tsx — Statusonderscheid in matrix

- De matrix-cellen tonen nu apart: **intake afgerond** en **wachtlijst** aantallen (bijv. "3 intake + 2 wachtlijst")
- Kleurgecodeerde sub-labels per cel, zodat direct zichtbaar is uit welke statusgroep de aantallen komen
- De summary-badges bovenaan splitsen ook op status

### 2. GroupComposer.tsx — Statusbadges en reservegebied-zoekknop

- Bij elke deelnemer in de groepskaart een extra statusbadge tonen: "Intake afgerond" (blauw) of "Wachtlijst" (oranje), naast de bestaande match-badge (Primair/Reserve/Flexibel)
- De sectietitel "Deelnemers" vervangen door twee subgroepen: **"Intake afgerond"** en **"Wachtlijst"**, visueel gescheiden
- **Nieuwe knop "Zoek op reservegebied"** per groepskaart: breidt de zoekcriteria uit naar reserve-gebieden en toont extra kandidaten die nog niet in de huidige groep zitten, met hun matchtype als badge
- Bij de beschikbaarheidsweergave (het groene/oranje voorstelblok) automatisch de beschikbaarheidsdata ophalen en tonen zodra een gebied+leeftijd combinatie wordt bekeken

### 3. PlanningPage.tsx — Beschikbaarheid direct zichtbaar bij groepsselectie

- Wanneer vanuit de WaitlistOverview een cel wordt aangeklikt (gebied + leeftijd), naast het openen van de GroupComposer ook direct een compact beschikbaarheidspaneel tonen
- Dit paneel toont per weekdag hoeveel van de kandidaten (intake_afgerond + wachtlijst) beschikbaar zijn
- Gebruikt dezelfde `client_availability` data die al opgehaald wordt

### 4. Gedeelde logica centraliseren

- De functies `resolveAreaId`, `getAgeCategory`, `calculateAge` en `getMatchType` worden nu op meerdere plekken gedupliceerd (WaitlistOverview, GroupComposer, clientUtils). Verplaats deze naar `src/lib/clientUtils.ts` als single source of truth
- Query keys voor group-composer en waitlist-overview preferences unificeren zodat dezelfde cache wordt gebruikt

## Technische details

**Gewijzigde bestanden:**
- `src/lib/clientUtils.ts` — gedeelde functies toevoegen (`resolveAreaId`, `getMatchType`, `getAgeCategoryPlanning`)
- `src/components/WaitlistOverview.tsx` — statusonderscheid in matrix, import gedeelde functies
- `src/components/GroupComposer.tsx` — statusbadges, subgroepen, reservegebied-zoekknop, import gedeelde functies
- `src/pages/PlanningPage.tsx` — beschikbaarheidspaneel bij groepsselectie
- `src/lib/queryKeys.ts` — geünificeerde query key voor area preferences

**Geen database-wijzigingen nodig** — alle benodigde data (`intake_status`, `client_availability`, `client_area_preferences`) is al beschikbaar.

