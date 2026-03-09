

## Probleem

De huidige PDF-rendering gebruikt `pdf-lib` met een eigen `renderPdf()` functie die paragrafen handmatig positioneert op een blanco pagina. Dit verliest alle originele opmaak: tabellen, kolommen, uitlijning, afbeeldingen, lettertypen, en kop-/voetteksten worden niet correct weergegeven. Headers/footers worden simpelweg als tekst bovenaan/onderaan de body geplakt in plaats van op elke pagina herhaald.

## Oplossingsrichtingen

Er zijn drie realistische opties:

### Optie 1: Geen PDF meer genereren — alleen DOCX (aanbevolen)
- Verwijder de PDF-optie en lever alleen DOCX-bestanden op
- DOCX behoudt 100% van de originele opmaak, tabellen, kop-/voetteksten, afbeeldingen
- Gebruikers kunnen zelf vanuit Word/Google Docs naar PDF exporteren
- **Voordeel**: Geen kwaliteitsverlies, minste werk
- **Nadeel**: Extra stap voor de gebruiker

### Optie 2: Server-side DOCX→PDF conversie via LibreOffice
- Gebruik een externe API-service zoals CloudConvert, Gotenberg, of ConvertAPI om de DOCX server-side naar PDF te converteren
- Deze diensten draaien LibreOffice/Word achter de schermen en behouden de volledige opmaak
- **Voordeel**: Pixel-perfecte PDF's met alle opmaak behouden
- **Nadeel**: Vereist een externe API-key en eventueel kosten per conversie

### Optie 3: Verbeterde pdf-lib rendering (beperkt)
- De huidige `renderPdf()` functie verbeteren met ondersteuning voor tabellen, kolommen, afbeeldingen
- **Voordeel**: Geen externe afhankelijkheden
- **Nadeel**: Enorm veel werk, zal nooit 100% van de Word-opmaak kunnen nabootsen. Geen ondersteuning voor complexe layouts, embedded fonts, etc.

## Aanbeveling

**Optie 1** is het meest pragmatisch: standaard DOCX uitvoeren. De documenten behouden dan alle opmaak perfect. Als PDF echt nodig is, kan **Optie 2** met een service als ConvertAPI worden toegevoegd.

