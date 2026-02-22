

# Masterplan: Fase 2 t/m 6

Dit is een groot traject. Om het beheersbaar te houden, bouwen we fase voor fase, stap voor stap. Hieronder het volledige plan.

---

## Fase 2: Intake en Aanmeld-flow

### 2A. Database-uitbreiding
Nieuwe kolommen toevoegen aan `clients`:
- `gender` (text)
- `class_group` (text)
- `address` (text)
- `postal_code` (text)
- `city` (text)
- `referrer_id` (uuid, FK naar referrers)
- `referral_reason` (text)
- `goals` (text)
- `intake_notes` (text)
- `intake_date` (date)
- `consent_data_processing` (boolean, default false)

RLS-policy voor anonieme INSERT op `clients` (beperkt tot de 8 publieke velden).

### 2B. Publiek aanmeldformulier
- Nieuwe pagina `/aanmelden` (geen login nodig)
- 8 velden: voornaam, achternaam, geboortedatum, school (dropdown), naam ouder, telefoon ouder, email ouder, reden aanmelding
- Zod-validatie, bevestigingsscherm na verzending
- Record wordt aangemaakt met `intake_status = 'nieuw'`

### 2C. Client detailpagina
- Nieuwe route `/clienten/:id`
- Tabbladen: Gegevens | Intake | Programma's | Audit Log
- Automatische audit-log bij openen dossier
- Bewerkbaar formulier voor alle velden

### 2D. Intake formulier met progressie-indicator
- Stoplicht (rood/oranje/groen) op basis van percentage ingevulde verplichte velden
- Automatische leeftijdsberekening (bestaat al)
- School-combobox met zoekfunctie
- Verwijzer-selectie gefilterd op school, met autofill contactgegevens

### Nieuwe bestanden
- `src/pages/AanmeldenPublicPage.tsx`
- `src/pages/ClientDetailPage.tsx`
- `src/components/IntakeForm.tsx`
- `src/components/IntakeProgress.tsx`
- `src/components/SchoolCombobox.tsx`

---

## Fase 3: Document Merge en Certificaten

### 3A. Template-beheer
- Upload Word-templates (.docx) naar storage bucket `document-templates`
- Templates bevatten placeholders zoals `{{client_naam}}`, `{{trainer_naam}}`, `{{doelen}}`
- Nieuwe tabel `document_templates` (id, name, file_path, category, placeholder_fields, created_at)
- UI op de Documenten-pagina om templates te uploaden en beheren

### 3B. Document generatie (Edge Function)
- Edge function `generate-document` die:
  1. Template uit storage haalt
  2. Placeholders vervangt met database-gegevens (client, programma, trainer)
  3. PDF genereert en opslaat in storage bucket `generated-documents`
- Nieuwe tabel `generated_documents` (id, client_id, template_id, file_path, generated_by, created_at)

### 3C. Certificaten en verslagen
- "Genereer certificaat" knop op de client-detailpagina
- Selecteer template, bekijk preview, genereer en download
- Automatische naamgeving: `[Naam_Kind]_[Type_Document].pdf`

### 3D. SharePoint-export (optioneel/later)
- Mapstructuur: `[Gebied]/[School]/[Naam_Kind]_[Type_Document].pdf`
- Vereist Microsoft Graph API-koppeling (apart connector-setup)

---

## Fase 4: WhatsApp-module

### 4A. Whapi API-koppeling
- Secret configureren: `WHAPI_API_KEY`
- Edge function `whatsapp-group` voor groepsaanmaak

### 4B. Automatische groepscreatie
- Per programma een WhatsApp-groep: "Kanjertraining - [Groepsnaam]"
- Knop op programma-detailpagina: "WhatsApp-groep aanmaken"
- Voegt automatisch ouders toe (met `whatsapp_consent = true`)
- Trainer wordt groepsbeheerder

### 4C. Smart Sync
- Bij wijziging deelnemers: automatisch leden toevoegen/verwijderen
- Toestemming-check voordat nummers worden toegevoegd

---

## Fase 5: Email en Communicatie

### 5A. Resend API-koppeling
- Secret configureren: `RESEND_API_KEY`
- Edge function `send-email` met templates

### 5B. Gepersonaliseerde updates
- Vanuit client-detailpagina: stuur update naar verwijzer
- Template-selectie met merge-velden

### 5C. Bulk mail / nieuwsbrief
- Nieuwe pagina of sectie onder Documenten
- Selecteer doelgroep (alle scholen, specifiek gebied, medewerkers)
- HTML-editor voor nieuwsbrief
- Afmeldlink-functionaliteit
- Verstuuroverzicht met status

---

## Fase 6: Beheer, GDPR en Audit

### 6A. Audit Log activeren in UI
- De `audit_log` tabel bestaat al
- Automatisch loggen bij openen client-dossier (in Fase 2C)
- Audit Log tab op client-detailpagina met wie/wanneer/actie
- Overzichtspagina voor backoffice met alle recente audit-events

### 6B. Volledige CSV-export
- Export-knop op elke lijstpagina (clienten, scholen, programma's)
- Alle codes omzetten naar leesbare tekst:
  - School-ID wordt schoolnaam
  - Boolean wordt Ja/Nee
  - Status-codes worden volledige labels
- Download als .csv met BOM voor Excel-compatibiliteit

### 6C. GDPR-tools
- "Verwijder alle data" knop per client (cascade delete met bevestiging)
- Data-retentie waarschuwingen voor oude dossiers
- Export persoonlijke gegevens per client (AVG-inzageverzoek)

---

## Volgorde van implementatie

We bouwen dit stap voor stap in de volgende volgorde:

1. **Fase 2A** - Database migratie (nieuwe kolommen)
2. **Fase 2B** - Publiek aanmeldformulier
3. **Fase 2C + 6A** - Client detailpagina met audit log
4. **Fase 2D** - Intake formulier met progressie
5. **Fase 6B** - CSV-export (snel te bouwen, direct nuttig)
6. **Fase 3A-3C** - Document merge en certificaten
7. **Fase 5A-5C** - Email/communicatie (vereist Resend API-key)
8. **Fase 4A-4C** - WhatsApp-module (vereist Whapi API-key)
9. **Fase 3D** - SharePoint (vereist Microsoft Graph connector)
10. **Fase 6C** - GDPR-tools

---

## Technische details

### Database migraties
```sql
-- Fase 2A: Uitbreiding clients tabel
ALTER TABLE clients ADD COLUMN gender text;
ALTER TABLE clients ADD COLUMN class_group text;
ALTER TABLE clients ADD COLUMN address text;
ALTER TABLE clients ADD COLUMN postal_code text;
ALTER TABLE clients ADD COLUMN city text;
ALTER TABLE clients ADD COLUMN referrer_id uuid REFERENCES referrers(id);
ALTER TABLE clients ADD COLUMN referral_reason text;
ALTER TABLE clients ADD COLUMN goals text;
ALTER TABLE clients ADD COLUMN intake_notes text;
ALTER TABLE clients ADD COLUMN intake_date date;
ALTER TABLE clients ADD COLUMN consent_data_processing boolean DEFAULT false;

-- Fase 3A: Document templates tabel
CREATE TABLE document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  file_path text NOT NULL,
  category text DEFAULT 'overig',
  placeholder_fields text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE generated_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id),
  template_id uuid REFERENCES document_templates(id),
  file_path text NOT NULL,
  generated_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### Nieuwe Edge Functions
- `generate-document` - Document merge en PDF-generatie
- `whatsapp-group` - WhatsApp-groep aanmaken/beheren via Whapi
- `send-email` - Email versturen via Resend
- `bulk-email` - Nieuwsbrief versturen

### Nieuwe Routes
- `/aanmelden` - Publiek (geen auth)
- `/clienten/:id` - Client detail (protected)

### Benodigde API-keys (later op te vragen)
- `RESEND_API_KEY` - Voor email-functionaliteit
- `WHAPI_API_KEY` - Voor WhatsApp-integratie
- Microsoft Graph connector - Voor SharePoint-export

