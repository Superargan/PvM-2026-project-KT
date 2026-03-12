

# Testmatrix: Status en feedback

## Conclusie

**Het scenario-systeem is nog niet geimplementeerd.** Er bestaat geen code voor:

- Geen `simulation_scenarios`, `simulation_scenario_slots`, of `simulation_scenario_members` tabellen
- Geen `save_scenario` of `convert_scenario_to_planning` RPCs
- Geen `ScenarioOverview` component
- Geen `validateScenarioSlot` of `validateScenario` functies
- Geen dirty state tracking, werkstate-bescherming, of conversielogica in `GroupComposer`

**Alle 40 tests (T01-T40) zijn niet uitvoerbaar** omdat de onderliggende functionaliteit volledig ontbreekt. Het plan is goedgekeurd en vastgelegd in `.lovable/plan.md`, maar de implementatie is nog niet gestart.

## Aanbeveling

De testmatrix is inhoudelijk correct en volledig dekkend voor het geplande systeem. Ik kan nu beginnen met de implementatie volgens het goedgekeurde plan (stap 1 t/m 8), waarna deze tests uitgevoerd kunnen worden.

Wil je dat ik begin met **Stap 1: de database-migratie** (tabellen, RPCs, triggers, indexen, RLS)?

