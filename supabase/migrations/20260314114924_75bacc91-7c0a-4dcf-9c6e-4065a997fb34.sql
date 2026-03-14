
-- 1. Dedicated sequence for concurrency-safe proforma number generation
CREATE SEQUENCE IF NOT EXISTS public.proforma_number_seq START 1;

-- 2. Add proforma_number column to simulation_scenarios
ALTER TABLE public.simulation_scenarios
  ADD COLUMN IF NOT EXISTS proforma_number text UNIQUE;

-- 3. Concurrency-safe proforma number generator using sequence
CREATE OR REPLACE FUNCTION public.generate_proforma_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year text := extract(year from now())::text;
  v_seq bigint;
BEGIN
  v_seq := nextval('public.proforma_number_seq');
  RETURN 'PF-' || v_year || '-' || lpad(v_seq::text, 3, '0');
END;
$$;

-- 4. Update save_scenario RPC to assign proforma_number on INSERT
CREATE OR REPLACE FUNCTION public.save_scenario(p_scenario_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_status text DEFAULT 'concept'::text, p_slots jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scenario_id uuid;
  v_slot jsonb;
  v_slot_id uuid;
  v_member jsonb;
  v_incoming_slot_ids uuid[];
  v_incoming_client_ids uuid[];
BEGIN
  IF NOT public.is_backoffice() THEN
    RAISE EXCEPTION 'Alleen backoffice-medewerkers mogen scenario''s opslaan';
  END IF;

  IF p_scenario_id IS NULL THEN
    INSERT INTO public.simulation_scenarios (name, description, status, created_by, updated_by, proforma_number)
    VALUES (p_name, p_description, p_status, auth.uid(), auth.uid(), public.generate_proforma_number())
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

  v_incoming_slot_ids := ARRAY[]::uuid[];
  IF p_slots IS NOT NULL AND jsonb_array_length(p_slots) > 0 THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
      IF v_slot->>'id' IS NOT NULL AND (v_slot->>'id') != '' THEN
        v_incoming_slot_ids := array_append(v_incoming_slot_ids, (v_slot->>'id')::uuid);
      END IF;
    END LOOP;
  END IF;

  IF array_length(v_incoming_slot_ids, 1) IS NULL THEN
    DELETE FROM public.simulation_scenario_slots WHERE scenario_id = v_scenario_id;
  ELSE
    DELETE FROM public.simulation_scenario_slots WHERE scenario_id = v_scenario_id AND id != ALL(v_incoming_slot_ids);
  END IF;

  IF p_slots IS NOT NULL AND jsonb_array_length(p_slots) > 0 THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
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
            notes = v_slot->>'notes',
            school_id = CASE WHEN v_slot->>'school_id' = '' THEN NULL ELSE (v_slot->>'school_id')::uuid END,
            training_location_id = CASE WHEN v_slot->>'training_location_id' = '' THEN NULL ELSE (v_slot->>'training_location_id')::uuid END,
            linked_program_id = CASE WHEN v_slot->>'linked_program_id' = '' OR v_slot->>'linked_program_id' IS NULL THEN NULL ELSE (v_slot->>'linked_program_id')::uuid END
        WHERE id = v_slot_id AND scenario_id = v_scenario_id;
      ELSE
        INSERT INTO public.simulation_scenario_slots (
          scenario_id, area_id, age_category, label, mode, proposal_idx,
          day_name, start_time, end_time, confirmed, notes, school_id, training_location_id, linked_program_id
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
          v_slot->>'notes',
          CASE WHEN v_slot->>'school_id' = '' THEN NULL ELSE (v_slot->>'school_id')::uuid END,
          CASE WHEN v_slot->>'training_location_id' = '' THEN NULL ELSE (v_slot->>'training_location_id')::uuid END,
          CASE WHEN v_slot->>'linked_program_id' = '' OR v_slot->>'linked_program_id' IS NULL THEN NULL ELSE (v_slot->>'linked_program_id')::uuid END
        )
        RETURNING id INTO v_slot_id;
      END IF;

      v_incoming_client_ids := ARRAY[]::uuid[];
      IF v_slot->'members' IS NOT NULL AND jsonb_array_length(v_slot->'members') > 0 THEN
        FOR v_member IN SELECT * FROM jsonb_array_elements(v_slot->'members') LOOP
          v_incoming_client_ids := array_append(v_incoming_client_ids, (v_member->>'client_id')::uuid);
        END LOOP;
      END IF;

      IF array_length(v_incoming_client_ids, 1) IS NULL THEN
        DELETE FROM public.simulation_scenario_members WHERE scenario_slot_id = v_slot_id;
      ELSE
        DELETE FROM public.simulation_scenario_members WHERE scenario_slot_id = v_slot_id AND client_id != ALL(v_incoming_client_ids);
      END IF;

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
