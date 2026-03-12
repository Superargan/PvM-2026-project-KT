

# Plan: Drie preciseringen toevoegen aan het scenarioplan

Het bestaande plan in `.lovable/plan.md` beschrijft de eerder voltooide implementatie. De drie preciseringen moeten worden toegevoegd als onderdeel van het nog te implementeren scenario-systeem. Ik voeg een nieuwe sectie toe aan `plan.md` die het volledige scenarioplan beschrijft inclusief de drie preciseringen.

---

## Wat wordt toegevoegd

Een nieuw blok **"Simulatiescenario's"** onder het bestaande plan, met alle 8 stappen en de drie preciseringen expliciet verwerkt in de relevante stappen.

### Precisering 1: `save_scenario` en lege arrays
Verwerkt in **Stap 2 (RPC `save_scenario`)**:
- Input wordt genormaliseerd: `NULL` arrays worden behandeld als lege arrays
- Expliciete `IF array_length IS NULL THEN delete-all ELSE delete-not-in-set END IF` logica
- Geen `NOT IN` constructie; alleen `!= ALL()` of volledige delete
- Scenario zonder slots en slots zonder members zijn valide states

### Precisering 2: Definitie "al ingepland"
Verwerkt in **Stap 3 (RPC `convert_scenario_to_planning`)** en **Stap 4 (validatielogica)**:
- Expliciet gedocumenteerd: `program_clients` gekoppeld aan `programs.archived IS NOT TRUE` is de enige bindende planningsbron
- SQL-commentaar in de migratie bevestigt dit
- Zelfde definitie in TypeScript validatie en in de RPC

### Precisering 3: `save_scenario` update-semantiek
Verwerkt in **Stap 2 (RPC `save_scenario`)**:
- Bij update: transactionele sync verwijdert slots die niet meer in de set zitten (cascade ruimt members op)
- Per slot: members die niet meer in de set zitten worden verwijderd
- `validation_status` wordt gereset naar `niet_gevalideerd` via de stale-on-change trigger
- `validation_details` en `last_validated_at` worden genulld door diezelfde trigger
- Geen verouderde data blijft achter na update

## Wijziging aan `plan.md`

Toevoegen van het volledige scenarioblok met deze drie preciseringen als expliciete acceptatiecriteria, zodat ze traceerbaar zijn bij implementatie.

| Bestand | Actie |
|---|---|
| `.lovable/plan.md` | Scenarioblok toevoegen met preciseringen |

