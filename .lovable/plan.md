

# Plan: Minimale sessieduur (2 uur) afdwingen in voorstellen

## Scope

3 bestanden, 4 taken.

### 1. `src/lib/clientUtils.ts` — regels 200–258

**1.1 Interface uitbreiden** (regels 200-206)

Voeg `clientIds: string[]` toe:

```typescript
export interface AvailabilityProposal {
  dayName: string;
  startTime: string;
  endTime: string;
  overlap: number;
  total: number;
  clientIds: string[];
}
```

**1.2 Helpertypes en hulpfuncties toevoegen** (vóór de functies, rond regel 200)

Worden expliciet toegevoegd:
- `NormalizedInterval` type
- `timeToMinutes()` en `minutesToTime()` hulpfuncties

De bestaande record-shape `{ dayOfWeek: number; dayName: string; startTime: string; endTime: string }` blijft als inline type in de signatuur (consistent met huidige code).

**1.3 `getTopAvailabilityOverlaps` volledig vervangen** (regels 218-258)

De aangeleverde TypeScript-implementatie wordt overgenomen met aanpassing naar het bestaande veldpatroon (`dayOfWeek`/`dayName`). Kernlogica:

- Geen `seenDays` dedup meer — alle intervallen per client per dag
- Daggroepering via `record.dayName`
- Kandidaat-starttijden = alle unieke intervalstarts van die dag
- Per kandidaat: `windowEnd = windowStart + minDurationMinutes`
- Client telt alleen mee als één individueel interval `start <= windowStart && end >= windowEnd`
- Filter score < 2, sorteer score DESC / startTime ASC
- Deduplicate per dag, return top `maxResults`

**1.4 `getAvailabilityOverlap` aanpassen** (regels 209-215)

Nieuwe parameter `minDurationMinutes = 120`, doorverwijzen naar `getTopAvailabilityOverlaps(..., 1, minDurationMinutes)`, return `results[0] ?? null`.

### 2. `src/components/GroupComposer.tsx` — regel 174

```typescript
const getSuggestions = (clientIds: Set<string>) =>
  getTopAvailabilityOverlaps(clientIds, availByClient, 3, 120);
```

### 3. `.lovable/plan.md`

Nieuwe sectie toevoegen die documenteert dat voorstellen nu werken met vaste 120-minuten vensters, `clientIds` is toegevoegd, en de dekregel.

### 4. Verificatie na implementatie

Na het doorvoeren van alle wijzigingen wordt het volgende geverifieerd en gerapporteerd:

- **Compilatie**: geen TypeScript-fouten
- **Bestaande tests**: `singleSourceOfTruth.test.ts` en `scenarioValidation.test.ts` slagen nog
- **Functionele controle**: de preview toont geen console-errors op de Groepen-tab
- **Exacte samenvatting**: per bestand wordt gemeld welke regels zijn gewijzigd, welke functies/types zijn toegevoegd of aangepast, en wat het waarneembare resultaat is

## Bestanden

| Bestand | Wijziging |
|---|---|
| `src/lib/clientUtils.ts` | Interface + helpertypes + 2 functies herschrijven |
| `src/components/GroupComposer.tsx` | Expliciet 120 doorgeven |
| `.lovable/plan.md` | Nieuwe documentatiesectie |

