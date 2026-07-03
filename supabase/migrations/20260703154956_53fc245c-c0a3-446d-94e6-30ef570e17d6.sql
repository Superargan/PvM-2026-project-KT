
-- 1) Revoke ALL from anon on every public table, then re-grant only what the public signup form needs
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.tablename);
  END LOOP;
END $$;

-- Public aanmeldformulier inserts into clients
GRANT INSERT ON public.clients TO anon;

-- 2) Revoke EXECUTE from anon on all public functions (RPCs/security-definer helpers)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- 3) Revoke EXECUTE from authenticated on internal-only SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_proforma_number() FROM authenticated, anon, public;
