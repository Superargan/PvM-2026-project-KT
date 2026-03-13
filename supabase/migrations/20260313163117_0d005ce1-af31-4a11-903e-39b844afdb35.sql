-- Add linked_program_id to scenario slots
ALTER TABLE public.simulation_scenario_slots
ADD COLUMN linked_program_id uuid REFERENCES public.programs(id) DEFAULT NULL;

-- Update save_scenario to handle linked_program_id
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

-- Update convert RPC to support linked_program_id
CREATE OR REPLACE FUNCTION public.convert_scenario_to_planning(p_scenario_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  v_is_linked boolean;
BEGIN
  IF NOT public.is_backoffice() THEN
    RAISE EXCEPTION 'Alleen backoffice-medewerkers mogen scenario''s omzetten';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_scenario_id::text));

  SELECT count(*) INTO v_all_confirmed_count
    FROM public.simulation_scenario_slots
    WHERE scenario_id = p_scenario_id AND confirmed = true;

  SELECT count(*) INTO v_already_success_count
    FROM public.simulation_scenario_slots
    WHERE scenario_id = p_scenario_id AND confirmed = true AND conversion_status = 'gelukt';

  FOR v_slot IN
    SELECT * FROM public.simulation_scenario_slots
    WHERE scenario_id = p_scenario_id
      AND confirmed = true
      AND conversion_status IN ('niet_geprobeerd', 'mislukt')
  LOOP
    BEGIN
      v_is_linked := v_slot.linked_program_id IS NOT NULL;

      IF v_is_linked THEN
        -- Verify the linked program exists and is not archived
        IF NOT EXISTS (
          SELECT 1 FROM public.programs
          WHERE id = v_slot.linked_program_id AND archived IS NOT TRUE
        ) THEN
          RAISE EXCEPTION 'Gekoppeld programma bestaat niet of is gearchiveerd';
        END IF;
        v_program_id := v_slot.linked_program_id;
      ELSE
        -- Check for conflicts (clients already in active programs)
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

        -- Create new program
        INSERT INTO public.programs (name, area_id, age_category, status, start_date, school_id, training_location_id)
        VALUES (
          'Scenario: ' || v_slot.label || ' (' || COALESCE(v_slot.age_category, '?') || ')',
          v_slot.area_id,
          v_slot.age_category,
          'gepland',
          CURRENT_DATE,
          v_slot.school_id,
          v_slot.training_location_id
        )
        RETURNING id INTO v_program_id;
      END IF;

      -- Add members to program (skip duplicates for linked programs)
      INSERT INTO public.program_clients (program_id, client_id)
      SELECT v_program_id, m.client_id
        FROM public.simulation_scenario_members m
        WHERE m.scenario_slot_id = v_slot.id
      ON CONFLICT DO NOTHING;

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
        'program_id', v_program_id,
        'linked', v_is_linked
      );

    EXCEPTION WHEN OTHERS THEN
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

  IF (v_success_count + v_already_success_count) >= v_all_confirmed_count AND v_all_confirmed_count > 0 THEN
    v_new_status := 'definitief';
  ELSIF (v_success_count + v_already_success_count) > 0 THEN
    v_new_status := 'gedeeltelijk_omgezet';
  ELSE
    v_new_status := NULL;
  END IF;

  IF v_new_status IS NOT NULL THEN
    UPDATE public.simulation_scenarios
    SET status = v_new_status, updated_by = auth.uid()
    WHERE id = p_scenario_id;
  END IF;

  RETURN v_results;
END;
$function$;