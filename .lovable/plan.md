
# Registratie alleen op uitnodiging van beheerders

## Overzicht
De openbare "Registreren" optie wordt verwijderd van de loginpagina. Nieuwe medewerkers kunnen alleen worden toegevoegd door een beheerder (backoffice) via de Medewerkers-pagina. De loginpagina toont uitsluitend het inlogformulier.

## Wat verandert er?

### 1. Loginpagina vereenvoudigen
- De "Registreren" knop en het registratieformulier worden verwijderd van de AuthPage
- Gebruikers zien alleen het inlogformulier (e-mail + wachtwoord)
- Geen mogelijkheid meer om zelf een account aan te maken

### 2. Uitnodigingsfunctie op Medewerkers-pagina
De "Medewerker Toevoegen" knop op de Medewerkers-pagina wordt gekoppeld aan een uitnodigingsformulier:
- Beheerder vult in: naam, e-mailadres en rol (backoffice of trainer)
- Een backend-functie stuurt een uitnodigingsmail naar de nieuwe medewerker
- De medewerker ontvangt een link om een wachtwoord in te stellen en het account te activeren

### 3. Backend-functie voor uitnodigingen
Een nieuwe backend-functie `invite-user` wordt aangemaakt die:
- Controleert of de aanvrager een backoffice-rol heeft
- Via de admin API een uitnodiging verstuurt naar het opgegeven e-mailadres
- Automatisch het profiel en de juiste rol (backoffice/trainer) aanmaakt
- Optioneel een koppeling maakt met een staff-record

### 4. Medewerkers-pagina uitbreiden
- De mock-data wordt vervangen door echte data uit de database (profiles + staff + user_roles)
- Een dialoogvenster voor "Medewerker Uitnodigen" met velden voor naam, e-mail en rol
- Overzicht van alle medewerkers met hun actuele rol en status

---

## Technische details

### AuthPage.tsx
- Verwijder alle registratie-gerelateerde state (`isLogin`, `fullName`) en UI-elementen
- Alleen het inlogformulier behouden (e-mail + wachtwoord)

### Edge Function: `invite-user`
- Ontvangt: `email`, `full_name`, `role` (backoffice/trainer)
- Valideert dat de aanvrager backoffice-rechten heeft via JWT-token
- Gebruikt `supabase.auth.admin.inviteUserByEmail()` om een uitnodiging te sturen
- Na aanmaak: voegt een rij toe aan `user_roles` met de juiste rol
- Het bestaande `handle_new_user` trigger zorgt automatisch voor het `profiles` record

### MedewerkersPage.tsx
- Vervang mock-data door queries op `profiles`, `staff` en `user_roles`
- Voeg een dialoogvenster toe met formulier voor naam, e-mail en rolselectie
- Bij verzenden wordt de `invite-user` backend-functie aangeroepen
- Toon succes/foutmelding na het versturen van de uitnodiging
