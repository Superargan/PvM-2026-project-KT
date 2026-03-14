

## Plan: Exclusieve clientselectie + impactindicatie bij reservekandidaten

### Probleem

Een client kan momenteel in meerdere groepen tegelijk worden aangevinkt (via checkbox). Er is geen waarschuwing of blokkade. Reserve-kandidaten verschijnen correct per slot, maar bij het aanvinken is de impact onduidelijk.

### Oplossing

Alle wijzigingen in `src/components/GroupComposer.tsx`:

**1. Exclusieve selectie afdwingen**

Bereken een `clientGroupAssignment: Map<clientId, groupKey>` — een map die per client bijhoudt in welke groep die momenteel is aangevinkt. Wordt afgeleid uit `selectedClients` state.

In `toggleClient()`:
- Als client al is aangevinkt in een **andere** groep: blokkeer de toggle en toon een toast met: "Deze cliënt is al geselecteerd in groep {areaName} {subGroupLabel}. Verwijder eerst de selectie daar."
- Als client al is aangevinkt in **dezelfde** groep: deselecteer (toggle uit).
- Anders: selecteer normaal.

In `toggleAll()`: filter clients die al in een andere groep zitten uit de selectie.

**2. Visuele indicatie bij reserve-kandidaten**

In `renderClientRow()`, als de client al is toegewezen aan een andere groep:
- Toon een waarschuwingsindicatie (oranje `AlertTriangle` icon + tekst "Al in groep {X}") naast de naam
- Checkbox wordt disabled met een tooltip die uitlegt waar de client al is geselecteerd
- De rij krijgt een subtiele `opacity-60` stijl

**3. Visuele indicatie bij primaire clients**

Clients in de primaire lijst die al in een andere subgroep (A vs B) zitten krijgen dezelfde disabled-behandeling. Dit voorkomt dat subgroep-splits dubbele selecties toestaan.

**4. Impact-tooltip bij reservekandidaat aanklikken**

Wanneer een reserve-kandidaat wordt aangevinkt (en niet geblokkeerd):
- Toon korte inline melding onder de checkbox: "Wordt toegevoegd aan deze groep als deelnemer"
- Bij een client die al in `programClients` zit (al definitief ingepland): toon waarschuwing "Al actief in een definitief programma"

### Technische details

```text
selectedClients state (bestaand):
  { groupKey → Set<clientId> }

Nieuwe computed (useMemo):
  clientGroupAssignment: Map<clientId, groupKey>
  → itereer alle entries in selectedClients, map elke clientId → groupKey

toggleClient(group, clientId):
  1. const existingGroup = clientGroupAssignment.get(clientId)
  2. if existingGroup && existingGroup !== currentKey → toast warning, return
  3. else → toggle normaal

renderClientRow(cm, group, selected):
  1. const assignedTo = clientGroupAssignment.get(client.id)
  2. const isAssignedElsewhere = assignedTo && assignedTo !== getGroupKey(group)
  3. if isAssignedElsewhere → disabled checkbox + warning badge
  4. if programClientIds.has(client.id) → "Al ingepland" badge (bestaand, nu prominenter)
```

### Bestanden

| Bestand | Wijziging |
|---|---|
| `src/components/GroupComposer.tsx` | `clientGroupAssignment` memo, `toggleClient` guard, `toggleAll` filter, `renderClientRow` indicaties |

