

## Plan: Documentatie toevoegen aan plan.md

De gevraagde secties worden onderaan het bestaande `plan.md` bestand toegevoegd. Dit zijn puur documentatiesecties die de audit-resultaten en beleidsregels rond gemeente-import vastleggen.

### Wat wordt toegevoegd

Alle volgende secties worden als één blok onderaan het bestand geplaatst:

1. **Import Parity Verification** — vergelijkingstabel met bestaande imports
2. **Ambiguity Handling Policy** — regels voor matching-ambiguïteit
3. **Municipality Import Enrichment Policy** — enrichment-only beleid (eenmalig, niet dubbel)
4. **SSOT Integrity Verification** — verificatieresultaten
5. **Default Municipality Consistency** — aanbeveling `DEFAULT_MUNICIPALITY` constant
6. **Import Safety Test Coverage** — testdekking (eenmalig, niet driedubbel)
7. **Centralisatie-opmerking** — alle gemeente-logica via `schoolTimes.ts`

### Deduplicatie

De gebruiker heeft enkele secties meerdere keren herhaald in het bericht. Deze worden slechts één keer opgenomen:
- "Municipality Import Enrichment Policy" — 1x (was 2x)
- "Import Safety Test Coverage" — 1x (was 3x)

### Bestand

| Bestand | Actie |
|---------|-------|
| `.lovable/plan.md` | Secties toevoegen onderaan |

