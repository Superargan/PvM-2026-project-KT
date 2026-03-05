
-- Junction table for assigning staff/trainers to client intakes
CREATE TABLE public.client_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, staff_id)
);

ALTER TABLE public.client_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backoffice manages client_assignments" ON public.client_assignments
  FOR ALL TO authenticated
  USING (is_backoffice())
  WITH CHECK (is_backoffice());

CREATE POLICY "Staff read own client_assignments" ON public.client_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff s 
    WHERE s.id = client_assignments.staff_id AND s.user_id = auth.uid()
  ));

-- Auto-trigger: set intake_status to 'intake_gepland' when intake_date is filled
CREATE OR REPLACE FUNCTION public.auto_intake_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  -- When intake_date goes from NULL to a value and status is still 'nieuw'
  IF OLD.intake_date IS NULL AND NEW.intake_date IS NOT NULL AND (OLD.intake_status IS NULL OR OLD.intake_status = 'nieuw') THEN
    NEW.intake_status := 'intake_gepland';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_intake_status
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_intake_status();
