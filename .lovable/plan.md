
# Importeren met Outlook-exportbestanden

## Wat verandert er?

De importfunctie wordt uitgebreid zodat naast Excel-bestanden (.xlsx/.xls) ook **CSV-bestanden** worden ondersteund. Outlook exporteert contactpersonen standaard als CSV-bestanden, vaak met puntkomma (;) als scheidingsteken en Windows-1252 codering.

## Aanpassingen

### 1. Bestandstypen uitbreiden
- De upload accepteert nu ook `.csv`-bestanden
- Automatische herkenning of het een Excel- of CSV-bestand is (op basis van extensie)

### 2. CSV-parsing toevoegen
- CSV-bestanden worden gelezen met correcte tekencodering (UTF-8 en Windows-1252)
- Ondersteuning voor zowel komma (,) als puntkomma (;) als scheidingsteken (Outlook gebruikt standaard puntkomma)

### 3. Outlook-kolomnamen herkennen
Outlook exporteert contactpersonen met Engelse of Nederlandse kolomnamen. De import herkent automatisch:
- **Naam**: First Name, Last Name, Voornaam, Achternaam, Display Name, Weergavenaam
- **E-mail**: E-mail Address, E-mailadres, Email
- **Telefoon**: Business Phone, Home Phone, Mobile Phone, Telefoon op werk, Mobiele telefoon
- **Functie**: Job Title, Functie
- **Bedrijf/School**: Company, Bedrijf (wordt gematcht aan bestaande scholen)

### 4. Contactpersonen-import (naast scholen-import)
- Nieuwe "Contactpersonen Importeren" knop
- Upload-dialoog specifiek voor contactpersonen
- School wordt automatisch gematcht op naam uit het "Company/Bedrijf"-veld
- Resultaat toont hoeveel contactpersonen geimporteerd en hoeveel niet gematcht konden worden

---

## Technische details

### Wijzigingen in `src/pages/ScholenPage.tsx`:

**Nieuwe state:**
- `contactUploadOpen` voor de contactpersonen-importdialoog

**CSV-parseerlogica:**
- Extensie-check: `.csv` wordt als tekst gelezen, `.xlsx`/`.xls` met XLSX-library
- CSV wordt gesplitst op regels, eerste regel = kolomnamen
- Scheidingsteken wordt automatisch gedetecteerd (puntkomma of komma)
- Voor- en achternaam worden gecombineerd tot een volledige naam

**Outlook-kolomherkenning:**
- Een mapping-object dat veelvoorkomende Outlook-kolomnamen (EN + NL) koppelt aan databasevelden (`name`, `email`, `phone`, `function_title`, `school`)

**School-matching:**
- Het "Company" of "Bedrijf" veld wordt vergeleken met bestaande schoolnamen (case-insensitive)
- Niet-gematchte rijen worden gerapporteerd aan de gebruiker

**Batch insert:**
- Contactpersonen worden in batches van 50 ingevoegd in de `referrers` tabel

### Bestaande scholen-import
- Wordt ook uitgebreid met CSV-ondersteuning (dezelfde parseerlogica)
- Accepteert nu `.xlsx`, `.xls` en `.csv`

### Database
- Geen wijzigingen nodig. De `referrers` tabel heeft alle benodigde kolommen.
