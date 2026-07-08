-- 1) Extend audit triggers to DELETE + mask sensitive fields + resilient client_id

CREATE OR REPLACE FUNCTION public.log_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_changed text[] := ARRAY[]::text[];
  v_key text;
  v_record_id uuid;
  v_client_id uuid;
  v_action text;
  -- Free-text / care fields that may contain sensitive personal data.
  -- Masked in old_values/new_values but still listed in changed_fields.
  v_sensitive_client text[] := ARRAY[
    'notes','intake_notes','referral_reason','goals','dropout_reason','area_notes'
  ];
  v_mask_fields text[] := ARRAY[]::text[];
BEGIN
  IF TG_TABLE_NAME = 'clients' THEN
    v_mask_fields := v_sensitive_client;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_old := NULL;
    v_changed := ARRAY(SELECT jsonb_object_keys(v_new));
    -- Mask sensitive fields in stored snapshot
    FOREACH v_key IN ARRAY v_mask_fields LOOP
      IF v_new ? v_key AND (v_new -> v_key) IS NOT NULL AND (v_new ->> v_key) <> '' THEN
        v_new := jsonb_set(v_new, ARRAY[v_key], '"[vertrouwelijk]"'::jsonb);
      END IF;
    END LOOP;
    v_action := 'insert';

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF (v_new -> v_key) IS DISTINCT FROM (v_old -> v_key) THEN
        v_changed := array_append(v_changed, v_key);
        IF v_key = ANY(v_mask_fields) THEN
          v_diff := v_diff || jsonb_build_object(
            v_key,
            jsonb_build_object('old', '[vertrouwelijk]', 'new', '[vertrouwelijk]')
          );
        ELSE
          v_diff := v_diff || jsonb_build_object(
            v_key,
            jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
          );
        END IF;
      END IF;
    END LOOP;
    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NEW; -- no-op update
    END IF;
    -- Mask sensitive fields in new_values snapshot as well
    FOREACH v_key IN ARRAY v_mask_fields LOOP
      IF v_new ? v_key AND (v_new -> v_key) IS NOT NULL AND (v_new ->> v_key) <> '' THEN
        v_new := jsonb_set(v_new, ARRAY[v_key], '"[vertrouwelijk]"'::jsonb);
      END IF;
    END LOOP;
    v_action := 'update';

  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_changed := ARRAY(SELECT jsonb_object_keys(v_old));
    -- Mask sensitive fields in the stored OLD snapshot
    FOREACH v_key IN ARRAY v_mask_fields LOOP
      IF v_old ? v_key AND (v_old -> v_key) IS NOT NULL AND (v_old ->> v_key) <> '' THEN
        v_old := jsonb_set(v_old, ARRAY[v_key], '"[vertrouwelijk]"'::jsonb);
      END IF;
    END LOOP;
    v_action := 'delete';
  END IF;

  -- Resolve record id from whichever snapshot exists
  BEGIN
    v_record_id := (COALESCE(v_new, v_old) ->> 'id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_record_id := NULL;
  END;

  -- Resolve linked client_id (FK safe)
  IF TG_TABLE_NAME = 'clients' THEN
    -- On DELETE of a client, the FK target is gone within this tx.
    -- Keep client_id NULL; the original id is preserved in record_id + old_values.
    IF TG_OP = 'DELETE' THEN
      v_client_id := NULL;
    ELSE
      v_client_id := v_record_id;
    END IF;
  ELSE
    BEGIN
      v_client_id := (COALESCE(v_new, v_old) ->> 'client_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_client_id := NULL;
    END;
  END IF;

  INSERT INTO public.audit_log (
    client_id, viewed_by, action, table_name, record_id,
    changed_fields, old_values, new_values, details
  ) VALUES (
    v_client_id,
    auth.uid(),
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    v_changed,
    CASE WHEN TG_OP = 'UPDATE' THEN v_diff
         WHEN TG_OP = 'DELETE' THEN jsonb_build_object('_deleted', v_old)
         ELSE NULL END,
    v_new,
    NULL
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit_change() FROM PUBLIC, anon, authenticated;

-- 2) Recreate triggers with DELETE included
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','programs','program_clients','attendance','schools','staff']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%s_change ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%s_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_change()',
      t, t
    );
  END LOOP;
END $$;

-- 3) Fix log_list_view: derive table_name from list name (explicit whitelist)
CREATE OR REPLACE FUNCTION public.log_list_view(p_list_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Niet geautoriseerd';
  END IF;
  v_table := CASE lower(p_list_name)
    WHEN 'deelnemerslijst'    THEN 'clients'
    WHEN 'wachtlijst'         THEN 'clients'
    WHEN 'aanmeldingenlijst'  THEN 'clients'
    ELSE NULL
  END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Onbekende lijst: %', p_list_name;
  END IF;
  INSERT INTO public.audit_log (viewed_by, action, table_name, details)
  VALUES (auth.uid(), 'list_view', v_table, p_list_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_list_view(text) TO authenticated;

-- 4) Retention: purge audit rows older than 24 months.
-- pg_cron is NOT available in this project, so this is invoked manually
-- (or via an external scheduler / edge function on a cron trigger).
CREATE OR REPLACE FUNCTION public.purge_old_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF NOT public.is_backoffice() THEN
    RAISE EXCEPTION 'Alleen backoffice mag audit-logs opschonen';
  END IF;
  DELETE FROM public.audit_log
   WHERE created_at < now() - interval '24 months';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_audit_logs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_old_audit_logs() TO authenticated;
