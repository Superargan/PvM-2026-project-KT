

# Plan: Test voor Single Source of Truth in gedeelde logica

## Bevindingen

Er zijn meerdere plekken waar dezelfde logica is gedupliceerd in plaats van `clientUtils.ts` te gebruiken:

| Duplicatie | Locatie | Probleem |
|---|---|---|
| `calculateAge` | `ClientDetailPage.tsx` regel 23-30 | Eigen implementatie (handmatige berekening i.p.v. `differenceInYears`) |
| `ageCategory` / `ageCategoryLabel` | `RapportagesPage.tsx` regel 34-48 | Eigen leeftijdscategorie-functies, andere grenzen (0-5, 6-9 vs 5-7, 8-12) |
| Inline leeftijdsberekening | `WaitlistManager.tsx` regel 141-143 | `differenceInYears` + inline ageGroup logica |
| Inline leeftijdsberekening | `PlanningPage.tsx` regel 51-53 | `differenceInYears` + inline filterlogica |

## Wat de test valideert

Een unit test in `src/test/singleSourceOfTruth.test.ts` die:

1. **Controleert dat `calculateAge` consistent werkt** -- dezelfde input geeft dezelfde output ongeacht welke methode wordt gebruikt (handmatig vs date-fns)
2. **Controleert dat `getAgeCategoryPlanning` de enige bron is voor leeftijdscategorieën** -- test de grenzen (4, 5, 7, 8, 12, 13 jaar)
3. **Controleert dat `resolveAreaId` correct fallback-logica toepast** -- waitlist_area_id > school > null
4. **Controleert dat `getMatchType` consistent match-prioritering toepast**

## Aanvullende fix

Naast de test ook de duplicaties oplossen:
- `ClientDetailPage.tsx`: lokale `calculateAge` vervangen door import uit `clientUtils`
- `WaitlistManager.tsx`: inline leeftijdsberekening vervangen door `calculateAge` + `getAgeGroup`
- `RapportagesPage.tsx`: `ageCategory`/`ageCategoryLabel` vervangen door import uit `clientUtils`
- `PlanningPage.tsx`: inline `differenceInYears` vervangen door `getAgeCategoryPlanning`

## Technische details

**Nieuwe bestanden:**
- `src/test/singleSourceOfTruth.test.ts` -- vitest unit tests

**Gewijzigde bestanden:**
- `src/pages/ClientDetailPage.tsx` -- verwijder lokale `calculateAge`, import uit clientUtils
- `src/components/WaitlistManager.tsx` -- gebruik `calculateAge` + `getAgeGroup` uit clientUtils
- `src/pages/RapportagesPage.tsx` -- gebruik functies uit clientUtils
- `src/pages/PlanningPage.tsx` -- gebruik `getAgeCategoryPlanning` uit clientUtils

