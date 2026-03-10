

## Plan: Feestdagen, Suikerfeest en vakanties in de planningskalender

### Wat wordt gebouwd
Een hardcoded dataset van Nederlandse feestdagen (inclusief Suikerfeest/Offerfeest) en schoolvakanties regio Zuid-Holland voor 2025-2027, die visueel worden weergegeven in de agenda (week- en maandweergave) op de PlanningPage.

### Aanpak

**1. Nieuwe utility: `src/lib/holidays.ts`**

Bevat twee exports:
- `HOLIDAYS`: array met vaste + variabele feestdagen (Nieuwjaar, Goede Vrijdag, Pasen, Koningsdag, Bevrijdingsdag, Hemelvaart, Pinksteren, Kerst, **Suikerfeest**, **Offerfeest**) voor 2025-2027
- `SCHOOL_VACATIONS`: array met schoolvakanties regio Zuid-Holland (herfst, kerst, voorjaar, mei, zomer) voor 2025-2027

Elk item: `{ date: "YYYY-MM-DD", name: string }` voor feestdagen, `{ start: "YYYY-MM-DD", end: "YYYY-MM-DD", name: string }` voor vakanties.

**2. Wijzigingen in `src/pages/PlanningPage.tsx`**

- Import holidays/vacations uit de nieuwe utility
- In de `agendaByDay` memo: per dag checken of het een feestdag of vakantiedag is
- **Weekweergave**: boven de intakes/sessies een visueel blok tonen (bijv. rood/roze voor feestdag, grijs voor vakantie) met de naam
- **Maandweergave**: in de dagcel een klein gekleurd label tonen voor feestdagen/vakanties
- Dagen met feestdagen krijgen een subtiele achtergrondkleur als visuele indicator

### Feestdagen dataset (2025-2027)

Vaste feestdagen + jaarlijks wisselende datums (Pasen, Hemelvaart, Pinksteren, Suikerfeest, Offerfeest) worden hardcoded per jaar opgenomen. Suikerfeest en Offerfeest datums zijn gebaseerd op de islamitische kalender en worden voor 2025-2027 vastgelegd.

### Geen database-wijzigingen nodig

Alles is frontend-only met een statische dataset.

