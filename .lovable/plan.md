

## Plan: Trainers zonder type meenemen in planningstool

### Huidige situatie
De bestaande beschikbaarheidstab toont al alle trainers, ook zonder `trainer_type`. De "Groepen samenstellen" tab moet nog gebouwd worden (eerder goedgekeurd plan).

### Aanpassing aan het plan
Bij de implementatie van "Groepen samenstellen" worden trainers als volgt gesuggereerd per groep:

- **Oudertrainer-dropdown**: toont trainers met `trainer_type` = `oudertrainer`, `beide`, **of `null`/leeg**
- **Kindtrainer-dropdown**: toont trainers met `trainer_type` = `kindtrainer`, `beide`, **of `null`/leeg**
- Trainers zonder type krijgen een label "(type onbekend)" zodat de planner weet dat het type nog ingesteld moet worden

### Wat wordt gebouwd (volledig, inclusief eerder plan)

**Geen database-wijzigingen nodig.**

**`src/pages/PlanningPage.tsx`** -- nieuw tab "Groepen samenstellen":

1. **Wachtlijst-deelnemers ophalen**: `clients` met `intake_status = 'wachtlijst'`, join naar `schools -> neighborhoods -> areas` voor gebiedsbepaling, plus `waitlist_area_id` als fallback
2. **Leeftijdsgroepering**: berekening op `date_of_birth` (5-7 / 8-12 jaar), groeperen per `area_id + leeftijdscategorie`
3. **Per groepskaart tonen**:
   - Gebied + leeftijdscategorie
   - Aantal deelnemers met kleurindicatie (groen >= 8, oranje 5-7, rood < 5)
   - Checkboxes per deelnemer (standaard aangevinkt)
   - **Oudertrainer dropdown**: alle trainers met type `oudertrainer`, `beide`, of *niet ingevuld* -- trainers zonder type tonen "(type onbekend)"
   - **Kindtrainer dropdown**: alle trainers met type `kindtrainer`, `beide`, of *niet ingevuld* -- idem
4. **"Groep aanmaken" actie**: maakt programma aan, koppelt deelnemers en trainers, zet status naar `actief`

### Filterlogica trainers (kernwijziging)

```text
-- Pseudo-code voor trainer selectie
Oudertrainer-opties = staff WHERE trainer_type IN ('oudertrainer', 'beide') OR trainer_type IS NULL
Kindtrainer-opties = staff WHERE trainer_type IN ('kindtrainer', 'beide') OR trainer_type IS NULL
```

### Bestanden die worden gewijzigd
- `src/pages/PlanningPage.tsx` -- toevoegen tab "Groepen samenstellen" met bovenstaande logica

