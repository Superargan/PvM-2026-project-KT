
-- 1) Extend audit_log
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS table_name text,
  ADD COLUMN IF NOT EXISTS record_id uuid,
  ADD COLUMN IF NOT EXISTS changed_fields text[],
  ADD COLUMN IF NOT EXISTS old_values jsonb,
  ADD COLUMN IF NOT EXISTS new_values jsonb;

ALTER TABLE public.audit_log ALTER COLUMN viewed_by DROP NOT NULL;

CREATE INDEX IF NOT EXISTS audit_log_table_record_idx ON public.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx   ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_viewed_by_idx    ON public.audit_log(viewed_by);

-- 2) Revoke anon INSERT on clients (public sign-up form is staff-only)
REVOKE INSERT ON public.clients FROM anon;

-- 3) Drop anon read on areas
DROP POLICY IF EXISTS "Anon read areas" ON public.areas;

-- 4) Re-scope every `public`-role policy to `authenticated`
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND 'public' = ANY(roles)
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated',
                   p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- 5) Disallow direct INSERT on audit_log from any client role.
--    Triggers and SECURITY DEFINER RPCs bypass this via service_role/owner.
DROP POLICY IF EXISTS "Authenticated inserts audit" ON public.audit_log;
REVOKE INSERT ON public.audit_log FROM authenticated, anon;

-- Keep SELECT policy readable to backoffice + self
-- (existing "Backoffice reads audit" already covers this)

-- 6) Generic audit trigger function
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_old := NULL;
    v_changed := ARRAY(SELECT jsonb_object_keys(v_new));
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF (v_new -> v_key) IS DISTINCT FROM (v_old -> v_key) THEN
        v_changed := array_append(v_changed, v_key);
        v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      END IF;
    END LOOP;
    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NEW; -- no-op update
    END IF;
  END IF;

  -- Resolve record id
  BEGIN
    v_record_id := (COALESCE(v_new, v_old) ->> 'id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_record_id := NULL;
  END;

  -- Resolve linked client_id if the table has one
  IF TG_TABLE_NAME = 'clients' THEN
    v_client_id := v_record_id;
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
    lower(TG_OP),
    TG_TABLE_NAME,
    v_record_id,
    v_changed,
    CASE WHEN TG_OP = 'UPDATE' THEN v_diff ELSE NULL END,
    v_new,
    NULL
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit_change() FROM PUBLIC, anon, authenticated;

-- 7) Attach triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','programs','program_clients','attendance','schools','staff']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%s_change ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%s_change AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_change()',
      t, t
    );
  END LOOP;
END $$;

-- 8) RPCs for view logging
CREATE OR REPLACE FUNCTION public.log_client_view(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Niet geautoriseerd';
  END IF;
  INSERT INTO public.audit_log (client_id, viewed_by, action, table_name, record_id, details)
  VALUES (p_client_id, auth.uid(), 'view', 'clients', p_client_id, 'Dossier geopend');
END;
$$;

CREATE OR REPLACE FUNCTION public.log_list_view(p_list_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Niet geautoriseerd';
  END IF;
  INSERT INTO public.audit_log (viewed_by, action, table_name, details)
  VALUES (auth.uid(), 'list_view', 'clients', p_list_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_client_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_list_view(text)    TO authenticated;
