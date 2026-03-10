

# Plan: Centraal queryKey-systeem voor consistente data-synchronisatie

## Probleem

Clientgegevens worden op 10+ plekken opgehaald met verschillende queryKeys:
- `["aanmeldingen", search]`, `["clients", search]`, `["waitlist-clients"]`, `["dashboard-new-clients"]`, `["planning-clients"]`, `["clients-by-school"]`, `["group-composer-clients"]`, `["waitlist-overview-clients"]`, `["rpt_clients"]`, etc.

Bij het opslaan op de ClientDetailPage worden alleen `["client", id]`, `["clients"]` en `["aanmeldingen"]` ge-invalideerd. Daardoor zien andere pagina's (Wachtlijst, Dashboard, Planning, Scholen, Rapportages) nog oude data.

Bovendien matcht `invalidateQueries({ queryKey: ["aanmeldingen"] })` niet met `["aanmeldingen", search]` tenzij `exact: false` wordt gebruikt (wat standaard is), maar sommige keys zoals `["waitlist-clients"]` worden helemaal niet ge-invalideerd.

## Oplossing

**Stap 1: Gedeelde queryKey-constanten en invalidatie-helper**

Maak een `src/lib/queryKeys.ts` met:
- Alle client-gerelateerde queryKeys onder een gemeenschappelijke prefix `"clients"`
- Een helper `invalidateAllClientQueries(queryClient)` die in een keer alle client-gerelateerde queries invalideert

```typescript
// src/lib/queryKeys.ts
export const queryKeys = {
  clients: {
    all: ["clients"] as const,
    list: (search?: string) => ["clients", "list", search] as const,
    detail: (id: string) => ["clients", "detail", id] as const,
    aanmeldingen: (search?: string) => ["clients", "aanmeldingen", search] as const,
    waitlist: ["clients", "waitlist"] as const,
    dashboard: ["clients", "dashboard"] as const,
    planning: ["clients", "planning"] as const,
    bySchool: ["clients", "by-school"] as const,
    rapportages: ["clients", "rapportages"] as const,
    groupComposer: ["clients", "group-composer"] as const,
    waitlistOverview: ["clients", "waitlist-overview"] as const,
  },
};

export function invalidateAllClientQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["clients"] });
}
```

Doordat alle keys nu beginnen met `["clients"]`, invalideert `invalidateQueries({ queryKey: ["clients"] })` automatisch **alle** client-queries in een keer.

**Stap 2: Alle pagina's bijwerken**

Vervang de huidige queryKeys in alle bestanden:

| Bestand | Oud | Nieuw |
|---|---|---|
| `AanmeldingenPage.tsx` | `["aanmeldingen", search]` | `["clients", "aanmeldingen", search]` |
| `ClientenPage.tsx` | `["clients", search]` | `["clients", "list", search]` |
| `WachtlijstPage.tsx` | `["waitlist-clients"]` | `["clients", "waitlist"]` |
| `ClientDetailPage.tsx` | `["client", id]` | `["clients", "detail", id]` |
| `Index.tsx` | `["dashboard-new-clients"]`, `["dashboard-waitlist"]`, `["dashboard-recent-clients"]` | `["clients", "dashboard", "new"]`, `["clients", "dashboard", "waitlist"]`, `["clients", "dashboard", "recent"]` |
| `PlanningPage.tsx` | `["planning-clients"]` | `["clients", "planning"]` |
| `ScholenPage.tsx` | `["clients-by-school"]` | `["clients", "by-school"]` |
| `RapportagesPage.tsx` | `["rpt_clients"]` | `["clients", "rapportages"]` |
| `WaitlistOverview.tsx` | `["waitlist-overview-clients"]` | `["clients", "waitlist-overview"]` |
| `WaitlistManager.tsx` | `["waitlist-clients", filterArea]` | `["clients", "waitlist", filterArea]` |
| `GroupComposer.tsx` | `["group-composer-clients"]` | `["clients", "group-composer"]` |
| `AvailabilityManager.tsx` | `["avail-clients"]` | `["clients", "avail"]` |
| `ProgramDetailPage.tsx` | `["all-clients-for-program"]` | `["clients", "for-program"]` |
| `ClientImport.tsx` | meerdere invalidates | `invalidateAllClientQueries(qc)` |

**Stap 3: Alle invalidatie-calls vereenvoudigen**

Op elke plek waar client-data wordt gemuteerd (ClientDetailPage save, WachtlijstPage assign, AanmeldingenPage edit, etc.), vervang de individuele invalidateQueries-calls door de enkele `invalidateAllClientQueries(queryClient)` call.

## Resultaat

- Wijziging op de clientkaart werkt direct door op alle pagina's
- Geen aparte invalidatie-lijsten meer nodig bij elke mutatie
- Nieuwe queries die beginnen met `["clients", ...]` worden automatisch mee-ge-invalideerd

## Bestanden die gewijzigd worden

- `src/lib/queryKeys.ts` (nieuw)
- `src/pages/ClientDetailPage.tsx`
- `src/pages/AanmeldingenPage.tsx`
- `src/pages/ClientenPage.tsx`
- `src/pages/WachtlijstPage.tsx`
- `src/pages/Index.tsx`
- `src/pages/PlanningPage.tsx`
- `src/pages/ScholenPage.tsx`
- `src/pages/RapportagesPage.tsx`
- `src/pages/ProgramDetailPage.tsx`
- `src/components/WaitlistOverview.tsx`
- `src/components/WaitlistManager.tsx`
- `src/components/GroupComposer.tsx`
- `src/components/AvailabilityManager.tsx`
- `src/components/ClientImport.tsx`

Geen database-migraties nodig.

