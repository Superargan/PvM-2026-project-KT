
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
  v_member_ids uuid[];
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
        IF NOT EXISTS (
          SELECT 1 FROM public.programs
          WHERE id = v_slot.linked_program_id AND archived IS NOT TRUE
        ) THEN
          RAISE EXCEPTION 'Gekoppeld programma bestaat niet of is gearchiveerd';
        END IF;
        v_program_id := v_slot.linked_program_id;
      ELSE
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

      -- Collect member IDs for this slot and set intake_status = 'actief'
      SELECT array_agg(m.client_id) INTO v_member_ids
        FROM public.simulation_scenario_members m
        WHERE m.scenario_slot_id = v_slot.id;

      IF v_member_ids IS NOT NULL AND array_length(v_member_ids, 1) > 0 THEN
        UPDATE public.clients
        SET intake_status = 'actief'
        WHERE id = ANY(v_member_ids);
      END IF;

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
