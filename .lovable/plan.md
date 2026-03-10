

# Plan: Testomgeving 2025 met Kanjertrainingen

## Huidige situatie

| Gegeven | Aantal |
|---------|--------|
| Programma's (2026, KT) | 28 (te_plannen) + 3 (ingepland) |
| Trainers | 1 (Patrick van Mastricht) |
| Scholen | 162 |
| Gebieden | 14 (alle Rotterdamse gebieden) |
| Cliënten | 1 |
| Sessies | 10 |

Er bestaan nog geen 2025-programma's. Alle huidige KT-nummers beginnen met 26xxx.

## Wat er nodig is

Om realistisch te testen hebben we voor 5 Kanjertrainingen (2025) het volgende nodig:

1. **5 KT-programma's** met naam `KT - 25001` t/m `KT - 25005`, status `afgerond`, met start/einddatum in 2025, leeftijdscategorie, en gekoppeld aan een gebied/school
2. **Trainers** - minimaal 4-6 extra trainers om realistisch 2 per programma te koppelen
3. **Cliënten** - minimaal 35-40 kinderen (7-8 per groep) met naam, geboortedatum, school
4. **Sessies** - 10 bijeenkomsten per programma (standaard KT = 10 lessen)
5. **Presentie** - aanwezigheidsregistratie per sessie per kind
6. **Koppelingen** - program_staff en program_clients records

## Aanpak

### Stap 1: Testdata genereren via SQL
Ik maak een script dat via database-inserts de volgende testdata aanmaakt:

- **5 programma's**: KT - 25001 t/m 25005, verdeeld over verschillende gebieden, mix van 5-7 en 8-12 jaar, status `afgerond`, periode jan-jun 2025
- **6 trainers**: realistische Nederlandse namen, gekoppeld aan scholen
- **40 cliënten**: kinderen met naam, geboortedatum (passend bij leeftijdscategorie), school, oudergegevens, intake_status `afgerond`
- **50 sessies**: 10 per programma, wekelijks verspreid over de periode
- **Koppelingen**: elke training 2 trainers + 7-8 kinderen
- **Presentie**: realistische aanwezigheid (~85%)

### Stap 2: Bestanden inlezen
Je noemde dat je bestanden hebt met 2025-gegevens. Na stap 1 kun je die uploaden zodat we echte data gebruiken in plaats van (of naast) gegenereerde testdata. We kunnen dan bestaande records bijwerken of aanvullen.

### Stap 3: Validatie
Na het inladen controleren we of:
- Programma's correct op de kaarten verschijnen
- Trainers en deelnemers zichtbaar zijn op de detailpagina
- Presentie en sessies kloppen
- Filters en rapportages werken met de 2025-data

## Vraag aan jou

Voordat ik begin:

- **Wil je eerst met puur gegenereerde testdata starten (5 programma's)**, zodat je daarna je eigen bestanden kunt uploaden om aan te vullen of te corrigeren?
- **Of wil je eerst je bestanden delen**, zodat ik de echte 2025-gegevens direct kan verwerken?

De eerste optie is het snelst om mee te testen; de tweede geeft meteen realistische data.

