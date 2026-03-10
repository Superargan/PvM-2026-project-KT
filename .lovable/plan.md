

## Plan: Controle-meldingen verbeteren - expliciet en zonder dubbelen

### Probleem
De Controle-tab kan dubbele deelnemers tonen als er duplicaten in de `clients`-array zitten, en de meldingen zijn niet altijd duidelijk genoeg over wat precies ontbreekt.

### Aanpassingen in `src/pages/AanmeldingenPage.tsx`

1. **Deduplicatie**: Clients filteren op uniek `id` voordat de checks draaien, zodat een deelnemer nooit twee keer in de lijst verschijnt.

2. **Samenvattingsoverzicht toevoegen**: Boven de tabel een overzicht tonen per ontbrekend veld, bijvoorbeeld:
   - "5 zonder geboortedatum"
   - "3 zonder school"
   - "4 zonder gebied"
   
   Dit maakt in één oogopslag duidelijk welke gegevens het meest ontbreken.

3. **Badges verduidelijken**: De destructive badges per deelnemer blijven, maar worden gecontroleerd op uniekheid (via `Set`) zodat er nooit dubbele badges bij dezelfde deelnemer staan.

4. **Alleen relevante checks voor status**: Optioneel: de "Gebied"-check alleen toepassen op deelnemers met status `wachtlijst` of `intake_afgerond`, zodat nieuwe aanmeldingen zonder gebied geen onnodige melding genereren.

### Technisch
- Deduplicatie via `Map` op `client.id` in de `MissingDataCheck` component
- Samenvattingstelling via een `reduce` over `REQUIRED_CHECKS` 
- Geen database-wijzigingen nodig

