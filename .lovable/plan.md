

## Plan: Schooltijden — Production-Grade Patch

### Phase 1: Repository Discovery Report

**School-related queries** (11 locations):
| File | Query Key | Select Fields |
|---|---|---|
| `ScholenPage.tsx` | `["schools", search]` | `*, neighborhoods(...), referrers(...)` |
| `ClientDetailPage.tsx` | `["schools-list"]` | `id, name, neighborhood_id, neighborhoods(area_id)` |
| `ClientDetailPage.tsx` | `["clients", "detail", id]` | `schools(name, neighborhood_id, neighborhoods(...))` |
| `ClientDetailPage.tsx` | `["client-programs", id]` | `programs(..., schools(name))` |
| `AanmeldingenPage.tsx` | `["schools-list"]` | `id, name, neighborhood_id, neighborhoods(area_id)` |
| `WachtlijstPage.tsx` | `["schools-list"]` | `id, name` |
| `ClientenPage.tsx` | `["schools-list"]` | `id, name` |
| `DocumentenPage.tsx` | `["schools-list"]` | `id, name` |
| `RapportagesPage.tsx` | `["rpt_schools"]` | `id, name, address` |
| `ProgramDetailPage.tsx` | (inline) | `id, name, neighborhood_id, neighborhoods(...)` |
| `AanmeldenPublicPage.tsx` | (inline) | `id, name, neighborhood_id, neighborhoods(area_id)` |
| `Index.tsx` | `["dashboard-schools"]` | count only |

**School-related mutations**: ScholenPage (`insert`, `update`, bulk-assign)

**Import flow**: `ScholenPage.tsx` lines 390-467 — `uploadMutation`, deduplicates by normalized name, inserts only new schools (no update of existing).

**Query key patterns**: Mix of `["schools", search]`, `["schools-list"]`, `["rpt_schools"]`, `["dashboard-schools"]`. Not centralized.

**Existing conventions**: No Zod. Manual validation. Toast for feedback. `src/lib/` for shared utils. Tests in `src/test/` using Vitest. `CLIENT_AREA_SELECT` in `clientUtils.ts`. No `schoolTimes.ts` exists. CHECK constraints used cautiously (knowledge files warn about using triggers instead for time-based checks).

**RLS impact**: None. Adding nullable columns to `schools` does not affect any existing RLS policies (all are role-based, not column-based).

---

### Phase 2: Architecture Convention Map

- **React Query keys**: Inline string arrays, partially centralized in `queryKeys.ts` for clients/areas/scenarios only
- **Cache invalidation**: `queryClient.invalidateQueries({ queryKey: [...] })`, sometimes `refetch()`
- **Supabase queries**: Direct `supabase.from().select().order()` pattern
- **Shared utils**: `src/lib/clientUtils.ts`, `src/lib/csvExport.ts`, `src/lib/postcodeMapping.ts`
- **Forms**: Controlled state via `useState`, manual validation before submit
- **Validation**: No Zod — manual checks with toast errors
- **Import column matching**: Inline fallback chains (e.g. `r["naam"] || r["Naam"] || ...`)
- **Import summaries**: Toast with counts
- **Generated types**: `src/integrations/supabase/types.ts` — auto-generated, do not edit
- **Tests**: Vitest, `src/test/singleSourceOfTruth.test.ts` for shared logic

**Important constraint from knowledge files**: CHECK constraints can cause restoration failures. The user's spec asks for a CHECK constraint, but per project conventions we should use a **validation trigger** instead.

---

### Phase 3: Patch Plan

#### 1. Database Migration

```sql
-- Add columns
ALTER TABLE public.schools
  ADD COLUMN school_start_time time without time zone,
  ADD COLUMN school_end_time time without time zone;

-- Validation trigger (not CHECK constraint, per project conventions)
CREATE OR REPLACE FUNCTION public.validate_school_times()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.school_start_time IS NULL) != (NEW.school_end_time IS NULL) THEN
    RAISE EXCEPTION 'Begin- en eindtijd moeten beide ingevuld zijn of beide leeg.';
  END IF;
  IF NEW.school_start_time IS NOT NULL AND NEW.school_start_time >= NEW.school_end_time THEN
    RAISE EXCEPTION 'Eindtijd moet later zijn dan begintijd.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_school_times
  BEFORE INSERT OR UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.validate_school_times();
```

**Rollback**:
```sql
DROP TRIGGER IF EXISTS trg_validate_school_times ON public.schools;
DROP FUNCTION IF EXISTS public.validate_school_times();
ALTER TABLE public.schools DROP COLUMN IF EXISTS school_end_time;
ALTER TABLE public.schools DROP COLUMN IF EXISTS school_start_time;
```

#### 2. New utility: `src/lib/schoolTimes.ts`

Centralized functions:
- `formatSchoolTime(value: string | null | undefined): string` — returns "HH:mm" or ""
- `formatSchoolTimeRange(start, end): string` — returns "08:30 – 15:00" or "—"
- `parseImportedSchoolTime(value: any): string | null` — handles HH:mm, H:mm, HH.mm, HH:mm:ss, Excel numeric; returns "HH:mm:ss" or null
- `validateSchoolTimePair(start, end): { valid: boolean; error?: string }` — both empty OK, both filled + ordered OK, partial or misordered invalid
- `SCHOOL_START_TIME_COLUMNS` / `SCHOOL_END_TIME_COLUMNS` — candidate column name arrays for import matching
- `findMatchingColumn(headers: string[], candidates: string[]): string | null`

#### 3. New file: `src/lib/queryKeys.ts` — extend with `schoolKeys`

```typescript
export const schoolKeys = {
  all: ["schools"] as const,
  list: (search?: string) => ["schools", "list", search] as const,
  dropdown: ["schools", "dropdown"] as const,
};

export function invalidateAllSchoolQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: schoolKeys.all });
}
```

#### 4. Files changed (per file):

| File | Change Type | What Changes |
|---|---|---|
| `src/lib/schoolTimes.ts` | **NEW** | Shared utility (format, parse, validate) |
| `src/lib/queryKeys.ts` | utility | Add `schoolKeys` + `invalidateAllSchoolQueries` |
| `src/pages/ScholenPage.tsx` | query, UI, import, mutation | Add time fields to query select, add/edit forms, table column, export column, import parsing with enrichment of existing schools |
| `src/pages/ClientDetailPage.tsx` | query, UI | Extend school join with time fields, display read-only "Schooltijden" in gegevens tab |
| `src/pages/AanmeldingenPage.tsx` | query key | Refactor to `schoolKeys.dropdown` |
| `src/pages/WachtlijstPage.tsx` | query key | Refactor to `schoolKeys.dropdown` |
| `src/pages/ClientenPage.tsx` | query key | Refactor to `schoolKeys.dropdown` |
| `src/pages/DocumentenPage.tsx` | query key | Refactor to `schoolKeys.dropdown` |
| `src/pages/RapportagesPage.tsx` | query key | Refactor to use `schoolKeys` prefix |
| `src/pages/ProgramDetailPage.tsx` | query key | Refactor to use `schoolKeys` prefix |
| `src/pages/Index.tsx` | query key | Refactor to use `schoolKeys` prefix |
| `src/test/schoolTimes.test.ts` | **NEW** | Unit tests for all shared utility functions |

#### 5. Detailed changes per file:

**`src/pages/ScholenPage.tsx`**:
- **Query** (line 176): Add `school_start_time, school_end_time` to select
- **`openEditSchool`** (line 274): Include time fields in `editForm`
- **`handleEditSchool`** (line 302): Include time fields in update payload, call `invalidateAllSchoolQueries`
- **`handleAddSchool`** (line 340): Include time fields in insert payload
- **Edit dialog** (after line 1321): Add two `<Input type="time">` for "Schooltijd begin" / "Schooltijd eind", with client-side validation via `validateSchoolTimePair` before submit
- **Add dialog** (after line 874): Same time inputs
- **Table** (after "Leerlingen" column, line 955): New "Schooltijden" column using `formatSchoolTimeRange`
- **Export** (lines 723-747): Add `schooltijden` column
- **Import** (`uploadMutation`, lines 390-467): 
  - Detect start/end time columns via `findMatchingColumn`
  - Parse values via `parseImportedSchoolTime`
  - Validate pairs via `validateSchoolTimePair`
  - For **existing schools**: fetch full records including times, update only when valid complete pair is provided and non-empty (never overwrite with empty/invalid)
  - Track and report: schools added, updated, times set, invalid time values
- **All mutation `onSuccess`**: Replace inline `queryClient.invalidateQueries({ queryKey: ["schools"] })` with `invalidateAllSchoolQueries(queryClient)`

**`src/pages/ClientDetailPage.tsx`**:
- **Client query** (line 64): Extend `schools(...)` select to include `school_start_time, school_end_time`
- **Schools list query** (line 77): Add `school_start_time, school_end_time` to select
- **Gegevens tab** (after school field, ~line 455): Display read-only row "Schooltijden: 08:30 – 15:00" using `formatSchoolTimeRange(client.schools?.school_start_time, client.schools?.school_end_time)`

#### 6. Import overwrite policy (implemented in ScholenPage upload):
- DB has times + import empty → keep existing
- DB has times + import valid → update
- DB has times + import invalid → keep existing, count as invalid
- Import has only one valid time (partial pair) → skip, count as invalid
- Import has both valid but end <= start → skip, count as invalid

#### 7. Tests: `src/test/schoolTimes.test.ts`

Covers:
- `formatSchoolTime`: null, undefined, "08:30:00" → "08:30", empty string
- `formatSchoolTimeRange`: both present, both absent, one absent
- `parseImportedSchoolTime`: HH:mm, H:mm, HH.mm, HH:mm:ss, Excel 0.354166→"08:30:00", null, "", garbage
- `validateSchoolTimePair`: both null OK, both valid OK, partial invalid, end <= start invalid, equal invalid
- `findMatchingColumn`: match found, no match, case-insensitive

#### 8. RLS/Policy safety

No changes needed. Existing policies are role-based (`is_backoffice()`, `is_trainer()`) and do not reference specific columns. Adding nullable columns has zero impact.

#### 9. Type updates

`src/integrations/supabase/types.ts` will be auto-regenerated after migration. The new fields (`school_start_time: string | null`, `school_end_time: string | null`) will appear in Row/Insert/Update types automatically.

#### 10. SSOT guarantee

- School times stored **only** in `schools.school_start_time` / `schools.school_end_time`
- Client detail reads via join `schools(school_start_time, school_end_time)` — no persistence on client
- All queries share `schoolKeys` prefix — `invalidateAllSchoolQueries` ensures immediate sync
- Import enriches existing records but never duplicates data
- Validation trigger at DB level prevents invalid state regardless of client

