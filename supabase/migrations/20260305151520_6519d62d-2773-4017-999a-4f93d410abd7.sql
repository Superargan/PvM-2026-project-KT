
CREATE TABLE public.client_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  available_date date NOT NULL,
  start_time time DEFAULT '09:00',
  end_time time DEFAULT '17:00',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, available_date)
);

ALTER TABLE public.client_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backoffice manages client_availability" ON public.client_availability
  FOR ALL TO authenticated
  USING (is_backoffice())
  WITH CHECK (is_backoffice());

CREATE POLICY "Trainers read client_availability" ON public.client_availability
  FOR SELECT TO authenticated
  USING (is_trainer());
