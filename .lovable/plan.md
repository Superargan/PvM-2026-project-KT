

## Verificatie: plan klopt met de huidige code

Alle regelnummers en inline logica in het plan zijn gecontroleerd tegen de huidige broncode. Bevindingen:

### Bevestigd correct

| Plan-referentie | Werkelijke code | Status |
|---|---|---|
| WaitlistOverview regel 29: select zonder `neighborhood_id` | Regel 29: `.select("id, first_name, ..., school_id, schools(...)")` — geen `neighborhood_id` | Correct |
| WaitlistOverview regels 57-64: `prefsByClient` als `Set<string>` | Regels 57-64: `Record<string, Set<string>>`, `.add(p.area_id)`, geen `preference_order` gebruik | Correct |
| WaitlistOverview regels 113-132: inline reserve/flexibel via Set | Regels 113-132: `reserveAreas.forEach(...)` + `reserveAreas?.has(a.id)` | Correct |
| GroupComposer regel 59: select zonder `neighborhood_id` | Regel 59: `.select("id, first_name, ..., school_id, schools(...)")` — geen `neighborhood_id` | Correct |
| GroupComposer regels 102-116: `availByClient` met fallback `"09:00"/"17:00"` | Regels 102-116: `a.start_time ?? "09:00"`, `a.end_time ?? "17:00"`, lokale `dayNames` | Correct |
| GroupComposer regels 119-154: `getSuggestion()` | Regels 119-154: eigen overlap met `dayStats`, `latestStart`/`earliestEnd` | Correct |
| GroupComposer regels 171-178: eigen `prefsByClient` | Regels 171-178: `Record<string, Record<string, number>>` — duplicaat van wat `buildPrefsByClientMap` wordt | Correct |
| PlanningPage regel 141: `useState("agenda")` | Regel 141: `useState("agenda")` | Correct |
| PlanningPage regels 379-403: eigen filters met `"alle"` | Regels 379-403: twee `Select`s met `"alle"` waarden | Correct |

### Conclusie

Het plan is volledig consistent met de huidige codebase. Alle genoemde regelnummers, inline logica en querystructuren kloppen. Geen aanpassingen nodig — het plan kan ongewijzigd worden uitgevoerd.

