
## Doel

1. Bewijzen dat de drie waarschuwingsknoppen (`Onbruikbare beschikbaarheid`, `Geen gebied`, `Overruled (admin)`) correct werken — ze staan nu op 0 omdat geen enkele deelnemer in die staat zit, niet omdat de logica stuk is.
2. De Planning-pagina merkbaar versnellen (doel: ≥8× minder werk bij 64+ deelnemers) zonder runtime-gedrag te veranderen.

---

## Deel 1 — Waarschuwingsknoppen verifiëren

De telling in `PlanningPage.tsx` (regels 434–497) gebruikt `getClientDataCompleteness` uit `DomainResolver`. Dat is dezelfde SSOT als de wachtlijst-matrix, dus de logica is al door tests gedekt. Het ontbreekt alleen aan **vitest-dekking voor de drie nul-categorieën** en aan **handmatige verificatie in de UI**.

Aanpak:
- Unit-test toevoegen in `src/test/` die `getClientDataCompleteness` voedt met 3 fixtures:
  - deelnemer met area + 1 beschikbaarheidsregel waarvan `start_time === end_time` → `unusableAvailability`
  - deelnemer zonder `waitlist_area_id`, zonder `neighborhood_id`, zonder `school_id` → `noArea`
  - deelnemer met record in `availability_override_logs` (active=true) → `isOverridden`
- Aanvullend een lichte integratietest die de exclusieve telling in `warningCounts` (overridden → noArea → unusable → noAvail → stale) bewaakt, zodat een toekomstige refactor niet stilletjes dubbeltelt.
- UI-verificatie: één seed-script of beschrijving in `.lovable/plan.md` met SQL die in de test-omgeving 1 deelnemer per categorie aanmaakt, zodat de knoppen visueel zichtbaar worden. Geen prod-data raken.

Geen wijziging aan logic of resolvers — alleen extra tests + verificatiepad.

---

## Deel 2 — Planning-pagina versnellen

### Geconstateerde knelpunten in `src/pages/PlanningPage.tsx`

1. **Onbegrensde fetch `allClientAvailability`** (r. 356–374) haalt élke `client_availability`-rij ooit op (paginated loop), voor élke render van Planning. Bij groei is dit de #1 kostenpost en hij wordt voor de warning-counts gebruikt terwijl alleen de planning-doelgroep relevant is.
2. **Query-key drift**: `planningKeys.clientAvailability` (r. 343) bevat geen `dateRange`, dus de cache voor week A wordt overschreven door week B → constante refetch bij navigatie.
3. **Nieuwe array-identiteit elke render** voor `intakeClientIds`, `programIds`, `candidateIds` (r. 256, 284, 76) → queryKey verandert elke render → React Query refetcht / dropt cache onnodig.
4. **`setInterval(…, 500)`** voor dirty-state polling (r. 205–211) draait permanent en triggert re-renders van de hele pagina, ook als er geen GroupComposer open is.
5. **`allClients.find(...)` in de warning-dialog** (r. 658) is O(n) per regel; bij 64+ deelnemers is dat O(n²). Een `Map<id, client>` lost dat in O(n) op.
6. **`getResolvedAreaName(c)` 2× per rij** in dezelfde render (r. 670). Memoize per client.
7. **`as any` casts** door het bestand (regels 65, 76, 95, 241, 256, 284, 326, 340, 427, 441, 501, 657, e.v.) — schendt project-regel "0 `any` in main app". Vervangen door bestaande shapes in `queryShapes.ts` (uitbreiden waar nodig).
8. **Verschillende queries fetchen overlappende kolommen**: `allClients` en `intakes` halen vrijwel dezelfde school/neighborhood-join. Niet samenvoegen (verschillende statusfilters), maar wél de geselecteerde kolommen strak gelijktrekken en hergebruiken via één `queryShape`.

### Wijzigingen (klein en deterministisch, geen gedragsverandering)

a. **`allClientAvailability` inperken tot planning-relevante deelnemers**
   - Verplaats de fetch achter een join: alleen `client_availability` waar `client_id ∈ planningClients`. Twee opties, kies de eenvoudigste:
     - Server-side: nieuwe RPC of `.in("client_id", planningClientIds)` met chunking van 1000 per `.in`-call.
   - Cache-key wordt `clientKeys.allAvailabilityForPlanning(planningClientIdsHash)` (toe te voegen in `queryKeys.ts`).
   - Resultaat: bij projecten met veel oud-deelnemers daalt het rijvolume drastisch (typisch >10×).

b. **Stabiliseer afgeleide id-arrays** met `useMemo` + `JSON.stringify`-vrije sleutel (sorted join), zodat queryKeys niet bij elke render veranderen. Toepassen op `intakeClientIds`, `programIds`, `candidateIds`.

c. **Voeg `dateRange` toe aan `planningKeys.clientAvailability`** (in `queryKeys.ts`). Voorkomt week-naar-week cache-overschrijving.

d. **Vervang `setInterval` door event-gedreven dirty-state**: `GroupComposerHandle` exposed nu al `hasUnsavedWork`; voeg een `onDirtyChange(cb)` subscription toe en gebruik die in `PlanningPage`. Polling verdwijnt.

e. **Bouw `clientsById = useMemo(() => new Map(allClients.map(c => [c.id, c])), [allClients])`** en gebruik die in de warning-dialog en agenda-mapping. Vervang ook `allClients.find` door lookups.

f. **Memoize `getResolvedAreaName` per client** binnen één render (kleine `Map<clientId, string>` in `useMemo` op `allClients + areas`).

g. **Type-discipline herstellen**: alle `(c: any)` / `(s: any)` callbacks vervangen door bestaande types (`ClientWithSchool`, `SessionWithProgram`, `ProgramStaffRow`) uit `queryShapes.ts`; uitbreiden waar een veld ontbreekt. Geen nieuwe ad-hoc types.

h. **Splits `WarningButton` en `WarningDetailDialog` naar een eigen bestand** met `React.memo`, zodat de hoofdpagina niet meer renderkant van de hele warning-balk + dialog herberekent bij elke datumnavigatie.

### Verwachte impact

| Bron van vertraging | Verwachte reductie |
|---|---|
| `allClientAvailability` volume | 5–20× minder rijen |
| Re-fetch door instabiele queryKeys | wegval (cache hits) |
| 500 ms polling re-renders | wegval |
| O(n²) warning-dialog lookups | 64 deelnemers ≈ 64× sneller |

Gecombineerd ruim boven de 8× target voor het 64+-deelnemers scenario.

### Tests

- Bestaande tests groen houden.
- Nieuwe tests:
  - `warningCounts`-exclusiviteit (Deel 1).
  - `clientsById` lookup-gedrag in de dialog (snapshot van rendering met 3 fixtures).
  - `queryKeys.clientAvailability` snapshot, om regressie op key-shape te voorkomen (Query Caching Rule SSOT).

### Niet in scope

- Geen wijziging aan `DomainResolver` / `clientUtils` of import-engine.
- Geen DB-migraties (geen schema-aanpassing nodig; eventuele RPC is optioneel onder optie a).
- Geen UI-redesign van de Planning-pagina; alleen interne refactor + extracties.

---

## Volgorde van uitvoeren

1. `queryShapes.ts` aanvullen waar velden ontbreken; types in `PlanningPage` vervangen → 0 `any`.
2. `queryKeys.ts` aanvullen: `clientAvailability(dateRange)`, `allAvailabilityForPlanning(ids)`.
3. Stabiele id-arrays + `clientsById`-map invoeren.
4. `allClientAvailability` inperken tot planning-doelgroep.
5. Polling → event-gedreven dirty-state.
6. WarningButton/Dialog extractie + `React.memo`.
7. Tests toevoegen (Deel 1 + queryKey snapshot + exclusiviteit).
8. Sanity check: bestaande vitest-suite + handmatige UI-verificatie van de 3 nul-categorieën.
