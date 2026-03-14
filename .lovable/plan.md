

## Probleem

Na het verwijderen van een scenario in `ScenarioOverview` worden de states `showGroupComposer` en `activeScenarioId` in `PlanningPage` niet gereset. Dit betekent:
- Als je een geladen scenario verwijdert terwijl de GroupComposer open is (`showGroupComposer = true`), blijft de GroupComposer zichtbaar met een ongeldig scenario-ID
- De WaitlistOverview (het "overzicht") wordt alleen getoond als `showGroupComposer === false`, dus het overzicht verdwijnt

## Oorzaak

In `ScenarioOverview.handleDelete()` (regel 133-147) wordt alleen de Supabase query-cache ge-invalideerd. Er is geen callback naar `PlanningPage` om de UI-state te resetten.

## Oplossing

Twee bestanden aanpassen:

### 1. `ScenarioOverview.tsx`
- Nieuwe prop `onScenarioDeleted?: (scenarioId: string) => void` toevoegen aan de interface
- Na een succesvolle delete deze callback aanroepen met het verwijderde ID

### 2. `PlanningPage.tsx`
- `onScenarioDeleted` callback meegeven aan `ScenarioOverview`
- In de callback: als het verwijderde ID gelijk is aan `activeScenarioId`, reset `activeScenarioId` naar `null` en `showGroupComposer` naar `false`

