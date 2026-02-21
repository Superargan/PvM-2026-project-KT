

# Gebied en Wijk toevoegen aan Programma's (Kanjertraining)

## Overzicht
De velden **Gebied** en **Wijk** worden toegevoegd aan de programma's/kanjertrainingen, zodat bij het aanmaken of bewerken van een training het gebied en de wijk kunnen worden vastgelegd -- net als bij scholen en clienten.

## Wat verandert er?

### 1. Database: twee nieuwe kolommen op `programs`
- `area_id` (optioneel, verwijst naar `areas`)
- `neighborhood_id` (optioneel, verwijst naar `neighborhoods`)

### 2. Formulier "Nieuw Programma" uitbreiden
Het aanmaakformulier op de Programma's-pagina krijgt:
- Een **Gebied**-dropdown (gevuld vanuit de `areas` tabel)
- Een **Wijk**-dropdown (gefilterd op het geselecteerde gebied)
- Later (als de postcode-mapping is gebouwd) kan dit ook automatisch worden ingevuld op basis van het adres van de gekoppelde school

### 3. Programmakaarten verrijken
Op de overzichtspagina wordt het gebied/wijk getoond bij elke kanjertraining, zodat je in een oogopslag ziet in welk deel van Rotterdam de training plaatsvindt.

### 4. Aansluiting op de postcode-mapping (vervolg)
Wanneer de herbruikbare `PostcodeAreaSelector`-component wordt gebouwd (uit het eerder goedgekeurde plan), wordt deze ook beschikbaar gemaakt voor het programmaformulier. Als een school wordt geselecteerd, kan het gebied automatisch worden overgenomen van die school.

---

## Technische details

### Database-migratie
```text
ALTER TABLE programs
  ADD COLUMN area_id UUID REFERENCES areas(id),
  ADD COLUMN neighborhood_id UUID REFERENCES neighborhoods(id);
```

### ProgrammasPage.tsx aanpassingen
- Areas en neighborhoods ophalen via query (zelfde patroon als ScholenPage)
- Twee Select-dropdowns toevoegen aan het formulier
- Wijk-dropdown filtert op basis van geselecteerd gebied
- Bij insert `area_id` en `neighborhood_id` meesturen
- In de programmakaarten het gebied tonen als badge

### Consistentie
Dezelfde dropdown-structuur als op de ScholenPage wordt hergebruikt: `Gebied -- Wijk` formaat. Later wordt dit vervangen door de herbruikbare `PostcodeAreaSelector`-component.

