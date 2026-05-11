## Doel
Vanuit de aanmelding direct kunnen bellen naar het opgegeven telefoonnummer (klik-om-te-bellen).

## Aanpak (frontend-only, geen backend)
Voeg naast de telefoonvelden een belknop (telefoon-icoon) toe die een `tel:`-link opent. Op mobiel start dit direct het belprogramma; op desktop opent het de standaard telapp (FaceTime / Teams / Skype).

### Wijzigingen
1. **`src/pages/AanmeldingenPage.tsx`** — In het bewerkingsformulier (regels ~659–664) bij elk telefoonveld (Telefoon + Telefoon alt) een `<a href="tel:...">` knop met `Phone`-icoon (lucide-react) naast de input. Knop is disabled wanneer het veld leeg is.

2. **`src/pages/ClientDetailPage.tsx`** — Zelfde patroon toepassen bij `guardian_phone` en `guardian_phone_alt` (regels ~517–520) zodat het gedrag consistent is in detail- en aanmeldweergave.

3. **Lijstweergave aanmeldingen** — Optioneel: in de tabelrij van een aanmelding ook een snel belicoontje tonen zodat je niet eerst hoeft te openen. (Bevestig of dit ook gewenst is.)

### Telnummer normalisatie
Spaties/streepjes verwijderen voor het `tel:`-protocol; nummer zelf in de UI ongewijzigd tonen.

### Geen backend nodig
- Geen Twilio/edge function — pure `tel:` link gebruikt het apparaat van de gebruiker.
- Wil je in plaats daarvan vanuit de browser kunnen bellen via Twilio Voice (gespreksopname, gespreksregistratie, vanuit kantoornummer), dan is dat een aparte, grotere feature met edge function + Twilio Voice SDK. Bevestig dan apart.

## Vraag
Wil je:
- (A) De simpele `tel:`-knop (start belapp van het apparaat), of
- (B) Browser-bellen via Twilio Voice (logging, vast afzendernummer, edge function)?
En: ook een belicoon in de aanmeldingen-lijst, of alleen in het detail/bewerkingsscherm?