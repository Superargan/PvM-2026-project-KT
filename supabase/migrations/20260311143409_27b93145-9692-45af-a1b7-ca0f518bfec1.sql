
-- Stap 1b: is_admin helper
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- Stap 1c: availability_override_logs
CREATE TABLE IF NOT EXISTS public.availability_override_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  overridden_by uuid NOT NULL,
  reason text NOT NULL,
  override_type text NOT NULL DEFAULT 'beschikbaarheid_verplichting',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_override_per_client_type
  ON public.availability_override_logs (client_id, override_type) WHERE (active = true);

ALTER TABLE public.availability_override_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage availability_override_logs"
  ON public.availability_override_logs FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Backoffice reads availability_override_logs"
  ON public.availability_override_logs FOR SELECT TO authenticated
  USING (is_backoffice());
