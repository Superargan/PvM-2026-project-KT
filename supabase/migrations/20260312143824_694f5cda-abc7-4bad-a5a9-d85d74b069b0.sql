
-- =====================================================
-- SIMULATIESCENARIO'S: Tabellen, RPCs, Triggers, Indexen, RLS
-- =====================================================

-- 1. TABELLEN
-- -----------------------------------------------------

CREATE TABLE public.simulation_scenarios (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'concept'
    CHECK (status IN ('concept', 'vastgezet', 'in_uitwerking', 'gecontroleerd', 'gedeeltelijk_omgezet', 'definitief')),
  validation_status text NOT NULL DEFAULT 'niet_gevalideerd'
    CHECK (validation_status IN ('geldig', 'aandacht_vereist', 'ongeldig', 'niet_gevalideerd')),
  validation_details jsonb,
  last_validated_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.simulation_scenario_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id uuid NOT NULL REFERENCES public.simulation_scenarios(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id),
  age_category text CHECK (age_category IS NULL OR age_category IN ('5-7 jaar', '8-12 jaar')),
  label text CHECK (label IS NULL OR label IN ('A', 'B', 'C', 'D', 'E', 'F')),
  mode text CHECK (mode IS NULL OR mode IN ('proposal', 'manual')),
  proposal_idx int,
  day_name text CHECK (day_name IS NULL OR day_name IN ('ma', 'di', 'wo', 'do', 'vr')),
  start_time time,
  end_time time,
  confirmed boolean NOT NULL DEFAULT false,
  notes text,
  conversion_status text NOT NULL DEFAULT 'niet_geprobeerd'
    CHECK (conversion_status IN ('niet_geprobeerd', 'gelukt', 'mislukt')),
  converted_program_id uuid REFERENCES public.programs(id),
  converted_at timestamptz,
  conversion_error text
);

CREATE TABLE public.simulation_scenario_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_slot_id uuid NOT NULL REFERENCES public.simulation_scenario_slots(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  has_override boolean NOT NULL DEFAULT false,
  validation_status text,
  validation_reasons text[],
  notes text,
  UNIQUE(scenario_slot_id, client_id)
);

-- 2. INDEXEN
-- -----------------------------------------------------

CREATE INDEX idx_scenario_slots_scenario ON public.simulation_scenario_slots(scenario_id);
CREATE INDEX idx_scenario_members_slot ON public.simulation_scenario_members(scenario_slot_id);
CREATE INDEX idx_scenario_members_client ON public.simulation_scenario_members(client_id);
CREATE INDEX idx_scenario_slots_converted_program ON public.simulation_scenario_slots(converted_program_id);

-- 3. UPDATED_AT TRIGGER (hergebruik bestaande functie)
-- -----------------------------------------------------

CREATE TRIGGER update_simulation_scenarios_updated_at
  BEFORE UPDATE ON public.simulation_scenarios
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. STALE-ON-CHANGE TRIGGER
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.invalidate_scenario_validation()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = 'public'
AS $function$
DECLARE
  v_scenario_id uuid;
BEGIN
  -- Bepaal scenario_id afhankelijk van tabel en operatie
  IF TG_TABLE_NAME = 'simulation_scenario_slots' THEN
    IF TG_OP = 'DELETE' THEN
      v_scenario_id := OLD.scenario_id;
    ELSE
      v_scenario_id := NEW.scenario_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'simulation_scenario_members' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT scenario_id INTO v_scenario_id
        FROM public.simulation_scenario_slots
        WHERE id = OLD.scenario_slot_id;
    ELSE
      SELECT scenario_id INTO v_scenario_id
        FROM public.simulation_scenario_slots
        WHERE id = NEW.scenario_slot_id;
    END IF;
  END IF;

  IF v_scenario_id IS NOT NULL THEN
    UPDATE public.simulation_scenarios
    SET validation_status = 'niet_gevalideerd',
        last_validated_at = NULL,
        validation_details = NULL
    WHERE id = v_scenario_id
      AND validation_status != 'niet_gevalideerd';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger op slots: niet op conversievelden
CREATE TRIGGER invalidate_validation_on_slot_change
  AFTER INSERT OR DELETE OR UPDATE OF area_id, age_category, label, mode, proposal_idx, day_name, start_time, end_time, confirmed, notes
  ON public.simulation_scenario_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_scenario_validation();

-- Trigger op members: alle wijzigingen
CREATE TRIGGER invalidate_validation_on_member_change
  AFTER INSERT OR UPDATE OR DELETE
  ON public.simulation_scenario_members
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_scenario_validation();

-- 5. RLS
-- -----------------------------------------------------

ALTER TABLE public.simulation_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_scenario_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_scenario_members ENABLE ROW LEVEL SECURITY;

-- simulation_scenarios
CREATE POLICY "Backoffice manages simulation_scenarios"
  ON public.simulation_scenarios FOR ALL
  TO authenticated
  USING ((select public.is_backoffice()))
  WITH CHECK ((select public.is_backoffice()));

CREATE POLICY "Trainers read simulation_scenarios"
  ON public.simulation_scenarios FOR SELECT
  TO authenticated
  USING ((select public.is_trainer()));

-- simulation_scenario_slots
CREATE POLICY "Backoffice manages simulation_scenario_slots"
  ON public.simulation_scenario_slots FOR ALL
  TO authenticated
  USING ((select public.is_backoffice()))
  WITH CHECK ((select public.is_backoffice()));

CREATE POLICY "Trainers read simulation_scenario_slots"
  ON public.simulation_scenario_slots FOR SELECT
  TO authenticated
  USING ((select public.is_trainer()));

-- simulation_scenario_members
CREATE POLICY "Backoffice manages simulation_scenario_members"
  ON public.simulation_scenario_members FOR ALL
  TO authenticated
  USING ((select public.is_backoffice()))
  WITH CHECK ((select public.is_backoffice()));

CREATE POLICY "Trainers read simulation_scenario_members"
  ON public.simulation_scenario_members FOR SELECT
  TO authenticated
  USING ((select public.is_trainer()));

-- 6. RPC: save_scenario
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_scenario(
  p_scenario_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_status text DEFAULT 'concept',
  p_slots jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $function$
DECLARE
  v_scenario_id uuid;
  v_slot jsonb;
  v_slot_id uuid;
  v_member jsonb;
  v_existing_slot_ids uuid[];
  v_incoming_slot_ids uuid[];
  v_existing_member_ids uuid[];
  v_incoming_client_ids uuid[];
BEGIN
  -- AUTORISATIE-BESLUIT:
  -- Supabase kent geen aparte database-rollen per applicatierol.
  -- Alle ingelogde gebruikers delen de 'authenticated' rol.
  -- GRANT EXECUTE TO authenticated is daarom de smalst mogelijke
  -- database-privilege-instelling.
  -- De interne is_backoffice() check is LEIDEND voor autorisatie.
  -- De RPC vertrouwt NIET op UI-beperkingen of frontend-logica.
  IF NOT public.is_backoffice() THEN
    RAISE EXCEPTION 'Alleen backoffice-medewerkers mogen scenario''s opslaan';
  END IF;

  -- INSERT of UPDATE scenario
  IF p_scenario_id IS NULL THEN
    INSERT INTO public.simulation_scenarios (name, description, status, created_by, updated_by)
    VALUES (p_name, p_description, p_status, auth.uid(), auth.uid())
    RETURNING id INTO v_scenario_id;
  ELSE
    UPDATE public.simulation_scenarios
    SET name = COALESCE(p_name, name),
        description = p_description,
        status = COALESCE(p_status, status),
        updated_by = auth.uid()
    WHERE id = p_scenario_id;
    v_scenario_id := p_scenario_id;
  END IF;

  -- SLOT-SYNC (AC-1 + AC-3)
  -- Verzamel inkomende slot IDs (bestaande slots die behouden worden)
  v_incoming_slot_ids := ARRAY[]::uuid[];
  IF p_slots IS NOT NULL AND jsonb_array_length(p_slots) > 0 THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
      IF v_slot->>'id' IS NOT NULL AND (v_slot->>'id') != '' THEN
        v_incoming_slot_ids := array_append(v_incoming_slot_ids, (v_slot->>'id')::uuid);
      END IF;
    END LOOP;
  END IF;

  -- Verwijder slots die niet meer in de set zitten (AC-3: CASCADE ruimt members op)
  IF array_length(v_incoming_slot_ids, 1) IS NULL THEN
    -- Lege set: verwijder ALLE bestaande slots
    DELETE FROM public.simulation_scenario_slots
    WHERE scenario_id = v_scenario_id;
  ELSE
    -- Verwijder slots die niet meer in de set zitten
    DELETE FROM public.simulation_scenario_slots
    WHERE scenario_id = v_scenario_id
      AND id != ALL(v_incoming_slot_ids);
  END IF;

  -- Upsert slots en sync members
  IF p_slots IS NOT NULL AND jsonb_array_length(p_slots) > 0 THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
      -- Upsert slot
      IF v_slot->>'id' IS NOT NULL AND (v_slot->>'id') != '' THEN
        v_slot_id := (v_slot->>'id')::uuid;
        UPDATE public.simulation_scenario_slots
        SET area_id = (v_slot->>'area_id')::uuid,
            age_category = v_slot->>'age_category',
            label = v_slot->>'label',
            mode = v_slot->>'mode',
            proposal_idx = (v_slot->>'proposal_idx')::int,
            day_name = v_slot->>'day_name',
            start_time = (v_slot->>'start_time')::time,
            end_time = (v_slot->>'end_time')::time,
            confirmed = COALESCE((v_slot->>'confirmed')::boolean, false),
            notes = v_slot->>'notes'
        WHERE id = v_slot_id AND scenario_id = v_scenario_id;
      ELSE
        INSERT INTO public.simulation_scenario_slots (
          scenario_id, area_id, age_category, label, mode, proposal_idx,
          day_name, start_time, end_time, confirmed, notes
        ) VALUES (
          v_scenario_id,
          (v_slot->>'area_id')::uuid,
          v_slot->>'age_category',
          v_slot->>'label',
          v_slot->>'mode',
          (v_slot->>'proposal_idx')::int,
          v_slot->>'day_name',
          (v_slot->>'start_time')::time,
          (v_slot->>'end_time')::time,
          COALESCE((v_slot->>'confirmed')::boolean, false),
          v_slot->>'notes'
        )
        RETURNING id INTO v_slot_id;
      END IF;

      -- MEMBER-SYNC per slot (AC-1 + AC-3)
      v_incoming_client_ids := ARRAY[]::uuid[];
      IF v_slot->'members' IS NOT NULL AND jsonb_array_length(v_slot->'members') > 0 THEN
        FOR v_member IN SELECT * FROM jsonb_array_elements(v_slot->'members') LOOP
          v_incoming_client_ids := array_append(v_incoming_client_ids, (v_member->>'client_id')::uuid);
        END LOOP;
      END IF;

      -- Verwijder members die niet meer in de set zitten
      IF array_length(v_incoming_client_ids, 1) IS NULL THEN
        DELETE FROM public.simulation_scenario_members
        WHERE scenario_slot_id = v_slot_id;
      ELSE
        DELETE FROM public.simulation_scenario_members
        WHERE scenario_slot_id = v_slot_id
          AND client_id != ALL(v_incoming_client_ids);
      END IF;

      -- Upsert members
      IF v_slot->'members' IS NOT NULL AND jsonb_array_length(v_slot->'members') > 0 THEN
        FOR v_member IN SELECT * FROM jsonb_array_elements(v_slot->'members') LOOP
          INSERT INTO public.simulation_scenario_members (
            scenario_slot_id, client_id, has_override, notes
          ) VALUES (
            v_slot_id,
            (v_member->>'client_id')::uuid,
            COALESCE((v_member->>'has_override')::boolean, false),
            v_member->>'notes'
          )
          ON CONFLICT (scenario_slot_id, client_id) DO UPDATE SET
            has_override = COALESCE((v_member->>'has_override')::boolean, false),
            notes = v_member->>'notes';
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  RETURN v_scenario_id;
END;
$function$;

-- Autorisatie: REVOKE/GRANT
REVOKE EXECUTE ON FUNCTION public.save_scenario FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_scenario FROM anon;
GRANT EXECUTE ON FUNCTION public.save_scenario TO authenticated;

-- 7. RPC: convert_scenario_to_planning
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.convert_scenario_to_planning(
  p_scenario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_slot RECORD;
  v_member RECORD;
  v_program_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_slot_result jsonb;
  v_all_confirmed_count int := 0;
  v_success_count int := 0;
  v_already_success_count int := 0;
  v_fail_count int := 0;
  v_new_status text;
  v_conflict_clients text[];
BEGIN
  -- Autorisatie
  IF NOT public.is_backoffice() THEN
    RAISE EXCEPTION 'Alleen backoffice-medewerkers mogen scenario''s omzetten';
  END IF;

  -- Advisory lock voorkomt race conditions (T32)
  PERFORM pg_advisory_xact_lock(hashtext(p_scenario_id::text));

  -- Tel alle bevestigde slots (incl. reeds gelukte)
  SELECT count(*) INTO v_all_confirmed_count
    FROM public.simulation_scenario_slots
    WHERE scenario_id = p_scenario_id AND confirmed = true;

  -- Tel reeds gelukte
  SELECT count(*) INTO v_already_success_count
    FROM public.simulation_scenario_slots
    WHERE scenario_id = p_scenario_id AND confirmed = true AND conversion_status = 'gelukt';

  -- Loop alleen over te verwerken slots (T30, T31: idempotentie)
  FOR v_slot IN
    SELECT * FROM public.simulation_scenario_slots
    WHERE scenario_id = p_scenario_id
      AND confirmed = true
      AND conversion_status IN ('niet_geprobeerd', 'mislukt')
  LOOP
    BEGIN
      -- BINDENDE PLANNINGSBRON-DEFINITIE (AC-2):
      -- Een cliënt is bindend ingepland als client_id voorkomt in public.program_clients
      -- gekoppeld aan een niet-gearchiveerd programma (public.programs.archived IS NOT TRUE).
      -- Dit is de enige bindende planningsbron in het systeem.
      v_conflict_clients := ARRAY[]::text[];
      SELECT array_agg(c.first_name || ' ' || c.last_name)
        INTO v_conflict_clients
        FROM public.simulation_scenario_members m
        JOIN public.clients c ON c.id = m.client_id
        WHERE m.scenario_slot_id = v_slot.id
          AND EXISTS (
            SELECT 1 FROM public.program_clients pc
            JOIN public.programs p ON p.id = pc.program_id
            WHERE pc.client_id = m.client_id
              AND p.archived IS NOT TRUE
          );

      IF array_length(v_conflict_clients, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'Deelnemers al ingepland: %', array_to_string(v_conflict_clients, ', ');
      END IF;

      -- Maak programma aan
      INSERT INTO public.programs (name, area_id, age_category, status, start_date)
      VALUES (
        'Scenario: ' || v_slot.label || ' (' || COALESCE(v_slot.age_category, '?') || ')',
        v_slot.area_id,
        v_slot.age_category,
        'gepland',
        CURRENT_DATE
      )
      RETURNING id INTO v_program_id;

      -- Koppel deelnemers
      INSERT INTO public.program_clients (program_id, client_id)
      SELECT v_program_id, m.client_id
        FROM public.simulation_scenario_members m
        WHERE m.scenario_slot_id = v_slot.id;

      -- Markeer slot als gelukt
      UPDATE public.simulation_scenario_slots
      SET conversion_status = 'gelukt',
          converted_program_id = v_program_id,
          converted_at = now(),
          conversion_error = NULL
      WHERE id = v_slot.id;

      v_success_count := v_success_count + 1;

      v_slot_result := jsonb_build_object(
        'slot_id', v_slot.id,
        'label', v_slot.label,
        'status', 'gelukt',
        'program_id', v_program_id
      );

    EXCEPTION WHEN OTHERS THEN
      -- Markeer slot als mislukt
      UPDATE public.simulation_scenario_slots
      SET conversion_status = 'mislukt',
          conversion_error = SQLERRM
      WHERE id = v_slot.id;

      v_fail_count := v_fail_count + 1;

      v_slot_result := jsonb_build_object(
        'slot_id', v_slot.id,
        'label', v_slot.label,
        'status', 'mislukt',
        'error', SQLERRM
      );
    END;

    v_results := v_results || v_slot_result;
  END LOOP;

  -- Bepaal nieuwe scenario-status
  IF (v_success_count + v_already_success_count) >= v_all_confirmed_count AND v_all_confirmed_count > 0 THEN
    v_new_status := 'definitief';
  ELSIF (v_success_count + v_already_success_count) > 0 THEN
    v_new_status := 'gedeeltelijk_omgezet';
  ELSE
    v_new_status := NULL; -- ongewijzigd
  END IF;

  IF v_new_status IS NOT NULL THEN
    UPDATE public.simulation_scenarios
    SET status = v_new_status, updated_by = auth.uid()
    WHERE id = p_scenario_id;
  END IF;

  RETURN v_results;
END;
$function$;

-- Autorisatie: REVOKE/GRANT
REVOKE EXECUTE ON FUNCTION public.convert_scenario_to_planning FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_scenario_to_planning FROM anon;
GRANT EXECUTE ON FUNCTION public.convert_scenario_to_planning TO authenticated;
